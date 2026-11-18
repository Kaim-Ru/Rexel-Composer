import type { PortRasters } from "./graph/node-definition.ts";
import type { RasterData } from "./image/raster.ts";

export interface ProjectFileSystem {
  read(projectPath: string): Promise<Uint8Array>;
}

export interface NodeTask {
  readonly type: string;
  readonly params: unknown;
  readonly inputs: Readonly<Record<string, RasterData>>;
}

export interface TaskRunner {
  run(task: NodeTask): Promise<PortRasters>;
}
