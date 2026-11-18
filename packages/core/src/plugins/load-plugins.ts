import { strFromU8 } from "fflate";
import { RexelError } from "../errors.ts";
import type { PluginSandbox, PluginSource, ProjectFileSystem } from "../host.ts";
import { createCoreRegistry, type NodeRegistry } from "../graph/node-registry.ts";
import type { Project } from "../project/schema.ts";
import { pluginDefinitions } from "./plugin-manifest.ts";

export async function readPluginSources(
  project: Project,
  fileSystem: ProjectFileSystem,
): Promise<PluginSource[]> {
  return Promise.all(
    project.plugins.map(async (plugin) => {
      try {
        return { ...plugin, code: strFromU8(await fileSystem.read(plugin.path)) };
      } catch (error) {
        throw new RexelError({
          reason: `Plugin "${plugin.id}": ${RexelError.from(error).message}`,
        });
      }
    }),
  );
}

export async function createProjectRegistry(
  project: Project,
  fileSystem: ProjectFileSystem,
  sandbox: PluginSandbox | undefined,
): Promise<NodeRegistry> {
  const registry = createCoreRegistry();
  if (project.plugins.length === 0 || sandbox === undefined) return registry;
  const manifests = await sandbox.load(await readPluginSources(project, fileSystem));
  return registry.with(pluginDefinitions(manifests));
}
