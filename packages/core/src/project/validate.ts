import { RexelError, type RexelErrorDetail } from "../errors.ts";
import type { ProjectFileSystem } from "../host.ts";
import type { NodeRegistry } from "../graph/node-registry.ts";
import { ProjectGraph } from "../graph/project-graph.ts";
import type { Project } from "./schema.ts";

export async function validateProject(
  project: Project,
  fileSystem: ProjectFileSystem,
  registry: NodeRegistry,
): Promise<RexelErrorDetail[]> {
  const errors: RexelErrorDetail[] = [];
  try {
    ProjectGraph.build(project, registry);
  } catch (error) {
    errors.push(RexelError.from(error).detail);
  }
  const files = [
    ...project.assets.map((asset) => ({ label: `Asset "${asset.id}"`, path: asset.path })),
    ...project.plugins.map((plugin) => ({ label: `Plugin "${plugin.id}"`, path: plugin.path })),
  ];
  for (const file of files) {
    try {
      await fileSystem.read(file.path);
    } catch (error) {
      errors.push({ reason: `${file.label}: ${RexelError.from(error).message}` });
    }
  }
  return errors;
}
