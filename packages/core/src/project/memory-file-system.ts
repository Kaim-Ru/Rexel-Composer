import { RexelError } from "../errors.ts";
import type { ProjectFileSystem } from "../host.ts";
import { normalizeProjectPath } from "./paths.ts";

export class MemoryFileSystem implements ProjectFileSystem {
  readonly files: Map<string, Uint8Array>;

  constructor(files: Iterable<readonly [string, Uint8Array]> = []) {
    this.files = new Map([...files].map(([path, data]) => [normalizeProjectPath(path), data]));
  }

  read(projectPath: string): Promise<Uint8Array> {
    const data = this.files.get(normalizeProjectPath(projectPath));
    if (data === undefined) {
      return Promise.reject(
        new RexelError({ reason: `File "${projectPath}" does not exist in the project folder` }),
      );
    }
    return Promise.resolve(data);
  }

  write(projectPath: string, data: Uint8Array): Promise<void> {
    this.files.set(normalizeProjectPath(projectPath), data);
    return Promise.resolve();
  }

  list(): Promise<string[]> {
    return Promise.resolve([...this.files.keys()].sort());
  }
}
