import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { assertInsideRoot, RexelError, type ProjectFileSystem } from "@rexel/core";

const PROJECT_SEPARATOR = "/";

export class NodeProjectFileSystem implements ProjectFileSystem {
  private constructor(private readonly root: string) {}

  static async open(directory: string): Promise<NodeProjectFileSystem> {
    return new NodeProjectFileSystem(await realpath(directory));
  }

  async read(projectPath: string): Promise<Uint8Array> {
    const target = join(this.root, ...projectPath.split(PROJECT_SEPARATOR));
    let resolved: string;
    try {
      resolved = await realpath(target);
    } catch {
      throw new RexelError({
        reason: `File "${projectPath}" does not exist in the project folder`,
      });
    }
    assertInsideRoot(this.root, resolved, projectPath);
    return readFile(resolved);
  }
}
