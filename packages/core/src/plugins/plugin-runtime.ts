import { PLUGIN_API_VERSION, type PluginNode } from "@rexel/plugin-api";
import { RexelError } from "../errors.ts";
import type { NodeTask } from "../host.ts";
import type { Values } from "../graph/values.ts";
import { pluginManifestSchema, pluginNodeType, type PluginManifest } from "./plugin-manifest.ts";

export interface LoadedPluginModule {
  readonly id: string;
  readonly module: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pluginExport(id: string, module: unknown): { apiVersion: unknown; nodes: unknown[] } {
  const candidate = isRecord(module) && "default" in module ? module.default : module;
  if (!isRecord(candidate) || !Array.isArray(candidate.nodes)) {
    throw new RexelError({ reason: `Plugin "${id}" must export default { apiVersion, nodes }` });
  }
  return { apiVersion: candidate.apiVersion, nodes: candidate.nodes };
}

export class PluginRuntime {
  private readonly nodes = new Map<string, PluginNode>();
  readonly manifests: PluginManifest[] = [];

  constructor(modules: readonly LoadedPluginModule[]) {
    for (const { id, module } of modules) {
      const plugin = pluginExport(id, module);
      if (plugin.apiVersion !== PLUGIN_API_VERSION) {
        throw new RexelError({
          reason: `Plugin "${id}" targets plugin API ${String(plugin.apiVersion)}, but this version supports ${PLUGIN_API_VERSION}`,
        });
      }
      const manifest = pluginManifestSchema.safeParse({ id, nodes: plugin.nodes });
      if (!manifest.success) {
        const [issue] = manifest.error.issues;
        throw new RexelError({
          reason: `Plugin "${id}": ${issue?.path.join(".") ?? ""} ${issue?.message ?? "is invalid"}`,
        });
      }
      for (const node of plugin.nodes as PluginNode[]) {
        if (typeof node.process !== "function") {
          throw new RexelError({
            reason: `Plugin "${id}": node "${node.name}" has no process function`,
          });
        }
        this.nodes.set(pluginNodeType(id, node.name), node);
      }
      this.manifests.push(manifest.data);
    }
  }

  run(task: NodeTask): Values {
    const node = this.nodes.get(task.type);
    if (node === undefined) throw new RexelError({ reason: `Unknown plugin node "${task.type}"` });
    return node.process(task.inputs as never, task.params as never, task.context);
  }
}
