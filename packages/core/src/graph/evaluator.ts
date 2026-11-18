import type { PortType } from "@rexel/plugin-api";
import { RexelError } from "../errors.ts";
import type { PluginSandbox, ProjectFileSystem, TaskRunner } from "../host.ts";
import { AssetLoader } from "./asset-loader.ts";
import type { EvaluationCache } from "./evaluation-cache.ts";
import { firstOutput } from "./node-definition.ts";
import { coerceLinkedValue } from "./params.ts";
import type { GraphNode, ProjectGraph } from "./project-graph.ts";
import { reviveRecord, valueMatchesType, type PortValue, type Values } from "./values.ts";

const HASH_SEED_PRIMARY = 0xdeadbeef;
const HASH_SEED_SECONDARY = 0x41c6ce57;
const HASH_MULTIPLIER_PRIMARY = 2654435761;
const HASH_MULTIPLIER_SECONDARY = 1597334677;
const HASH_FINAL_PRIMARY = 2246822507;
const HASH_FINAL_SECONDARY = 3266489909;
const HASH_SHIFT_HIGH = 16;
const HASH_SHIFT_MID = 13;
const HASH_HIGH_BITS = 2097151;
const HASH_HIGH_SCALE = 4294967296;
const HASH_RADIX = 36;

function hashString(text: string): string {
  let first = HASH_SEED_PRIMARY;
  let second = HASH_SEED_SECONDARY;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, HASH_MULTIPLIER_PRIMARY);
    second = Math.imul(second ^ code, HASH_MULTIPLIER_SECONDARY);
  }
  first = Math.imul(first ^ (first >>> HASH_SHIFT_HIGH), HASH_FINAL_PRIMARY);
  first ^= Math.imul(second ^ (second >>> HASH_SHIFT_MID), HASH_FINAL_SECONDARY);
  second = Math.imul(second ^ (second >>> HASH_SHIFT_HIGH), HASH_FINAL_PRIMARY);
  second ^= Math.imul(first ^ (first >>> HASH_SHIFT_MID), HASH_FINAL_SECONDARY);
  return (HASH_HIGH_SCALE * (HASH_HIGH_BITS & second) + (first >>> 0)).toString(HASH_RADIX);
}

export interface EvaluationListener {
  nodeStarted?: (id: string) => void;
  nodeFinished?: (id: string, cached: boolean) => void;
}

export interface EvaluationHost {
  readonly fileSystem: ProjectFileSystem;
  readonly taskRunner: TaskRunner;
  readonly pluginSandbox?: PluginSandbox;
}

export interface EvaluationOptions {
  readonly listener?: EvaluationListener;
  readonly cache?: EvaluationCache;
  readonly assets?: AssetLoader;
}

export interface PrimaryOutput {
  readonly port: string;
  readonly type: PortType;
  readonly value: PortValue;
}

export class GraphEvaluator {
  private readonly running = new Map<string, Promise<Values>>();
  private readonly signatures = new Map<string, string>();
  private readonly assets: AssetLoader;

  constructor(
    private readonly graph: ProjectGraph,
    private readonly host: EvaluationHost,
    private readonly options: EvaluationOptions = {},
  ) {
    this.assets = options.assets ?? new AssetLoader(host.fileSystem);
  }

  async evaluatePrimary(id: string): Promise<PrimaryOutput> {
    const [port, type] = firstOutput(this.graph.get(id).definition);
    const value = (await this.evaluate(id))[port];
    if (value === undefined) {
      throw new RexelError({ node: id, reason: `Output "${port}" produced no value` });
    }
    return { port, type, value };
  }

  evaluate(id: string): Promise<Values> {
    let result = this.running.get(id);
    if (result === undefined) {
      result = this.compute(id).catch((error: unknown) => {
        throw RexelError.from(error, id);
      });
      this.running.set(id, result);
    }
    return result;
  }

  private signature(id: string): string {
    const known = this.signatures.get(id);
    if (known !== undefined) return known;
    const node = this.graph.get(id);
    const links = (references: ReadonlyMap<string, { node: string; port: string }>) =>
      [...references]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([port, link]) => [port, this.signature(link.node), link.port]);
    const assetPaths = Object.entries(node.definition.params)
      .filter(([, spec]) => spec.kind === "asset")
      .map(
        ([name]) =>
          this.graph.project.assets.find((asset) => asset.id === node.params[name])?.path ?? "",
      );
    const signature = hashString(
      JSON.stringify([
        node.definition.type,
        node.params,
        assetPaths,
        links(node.inputLinks),
        links(node.paramLinks),
        this.graph.project.canvas,
      ]),
    );
    this.signatures.set(id, signature);
    return signature;
  }

  private async gather(
    id: string,
    links: ReadonlyMap<string, { node: string; port: string }>,
    ports: readonly string[],
    required: boolean,
  ): Promise<Record<string, PortValue>> {
    const entries = await Promise.all(
      ports.map(async (port) => {
        const link = links.get(port);
        if (link === undefined) {
          if (required)
            throw new RexelError({ node: id, reason: `Input "${port}" is not connected` });
          return undefined;
        }
        const value = (await this.evaluate(link.node))[link.port];
        if (value === undefined) {
          throw new RexelError({
            node: link.node,
            reason: `Output "${link.port}" produced no value`,
          });
        }
        return [port, value] as const;
      }),
    );
    return Object.fromEntries(entries.filter((entry) => entry !== undefined));
  }

  private async resolveParams(node: GraphNode): Promise<Record<string, unknown>> {
    const linked = await this.gather(node.id, node.paramLinks, [...node.paramLinks.keys()], false);
    const params: Record<string, unknown> = { ...node.params };
    for (const [name, value] of Object.entries(linked)) {
      const spec = node.definition.params[name];
      if (spec !== undefined) params[name] = coerceLinkedValue(spec, value);
    }
    for (const [name, spec] of Object.entries(node.definition.params)) {
      if (spec.kind !== "asset") continue;
      const asset = this.graph.project.assets.find((candidate) => candidate.id === params[name]);
      if (asset === undefined) {
        params[name] = undefined;
        continue;
      }
      try {
        params[name] =
          spec.assetKind === "image"
            ? await this.assets.image(asset.path)
            : await this.assets.palette(asset.path);
      } catch (error) {
        throw new RexelError({
          node: node.id,
          param: name,
          reason: RexelError.from(error).message,
        });
      }
    }
    return params;
  }

  private async compute(id: string): Promise<Values> {
    const node = this.graph.get(id);
    const key = this.signature(id);
    const cached = this.options.cache?.get(key);
    if (cached !== undefined) {
      this.options.listener?.nodeFinished?.(id, true);
      return cached;
    }
    const { definition } = node;
    const [inputs, params] = await Promise.all([
      this.gather(id, node.inputLinks, Object.keys(definition.inputs), true),
      this.resolveParams(node),
    ]);
    this.options.listener?.nodeStarted?.(id);
    const context = { canvas: this.graph.project.canvas };
    const { execution } = definition;
    let outputs: Values;
    if (execution.kind === "inline") {
      outputs = execution.evaluate(inputs, params);
    } else if (execution.kind === "pure") {
      outputs = await this.host.taskRunner.run({ type: definition.type, inputs, params, context });
    } else {
      const sandbox = this.host.pluginSandbox;
      if (sandbox === undefined) {
        throw new RexelError({ node: id, reason: "Plugins are not enabled for this project" });
      }
      outputs = reviveRecord(
        await sandbox.run({ type: definition.type, inputs, params, context }),
      ) as Values;
    }
    for (const [port, type] of Object.entries(definition.outputs)) {
      if (!valueMatchesType(outputs[port], type)) {
        throw new RexelError({ node: id, reason: `Output "${port}" did not produce a ${type}` });
      }
    }
    this.options.cache?.set(key, outputs);
    this.options.listener?.nodeFinished?.(id, false);
    return outputs;
  }
}
