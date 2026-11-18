import { RexelError } from "../errors.ts";
import type { TaskRunner } from "../host.ts";
import type { Raster } from "../image/raster.ts";
import type { EvaluationContext, PortRasters } from "./node-definition.ts";
import type { ProjectGraph } from "./project-graph.ts";

export interface EvaluationListener {
  nodeStarted(id: string): void;
  nodeFinished(id: string): void;
}

export interface EvaluatorHost extends EvaluationContext {
  readonly taskRunner: TaskRunner;
}

export class GraphEvaluator {
  private readonly results = new Map<string, Promise<PortRasters>>();

  constructor(
    private readonly graph: ProjectGraph,
    private readonly host: EvaluatorHost,
    private readonly listener: EvaluationListener,
  ) {}

  async evaluateImage(id: string): Promise<Raster> {
    const node = this.graph.get(id);
    const [port] = node.definition.outputs;
    if (port === undefined) throw new RexelError({ node: id, reason: "Node has no output" });
    const raster = (await this.evaluate(id))[port];
    if (raster === undefined) {
      throw new RexelError({ node: id, reason: `Output "${port}" produced no image` });
    }
    return raster;
  }

  private evaluate(id: string): Promise<PortRasters> {
    let result = this.results.get(id);
    if (result === undefined) {
      result = this.run(id).catch((error: unknown) => {
        throw RexelError.from(error, id);
      });
      this.results.set(id, result);
    }
    return result;
  }

  private async gatherInputs(id: string): Promise<PortRasters> {
    const node = this.graph.get(id);
    const entries = await Promise.all(
      node.definition.inputs.map(async (port) => {
        const link = node.inputLinks.get(port);
        if (link === undefined) {
          throw new RexelError({ node: id, reason: `Input "${port}" is not connected` });
        }
        const raster = (await this.evaluate(link.node))[link.port];
        if (raster === undefined) {
          throw new RexelError({
            node: link.node,
            reason: `Output "${link.port}" produced no image`,
          });
        }
        return [port, raster] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  private async run(id: string): Promise<PortRasters> {
    const inputs = await this.gatherInputs(id);
    const { definition, params } = this.graph.get(id);
    this.listener.nodeStarted(id);
    const { execution } = definition;
    const outputs =
      execution.kind === "pure"
        ? await this.host.taskRunner.run({ type: definition.type, params, inputs })
        : await execution.evaluate(inputs, params, this.host);
    for (const port of definition.outputs) {
      if (outputs[port] === undefined) {
        throw new RexelError({ node: id, reason: `Output "${port}" produced no image` });
      }
    }
    this.listener.nodeFinished(id);
    return outputs;
  }
}
