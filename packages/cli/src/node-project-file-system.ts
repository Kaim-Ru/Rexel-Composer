import { mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import {
  assertInsideRoot,
  normalizeProjectPath,
  RexelError,
  type ProjectFileSystem,
} from "@rexel/core";

const PROJECT_SEPARATOR = "/";
const MAX_LISTED_FILES = 10_000;
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);

export class NodeProjectFileSystem implements ProjectFileSystem {
  private constructor(private readonly root: string) {}

  static async open(directory: string): Promise<NodeProjectFileSystem> {
    return new NodeProjectFileSystem(await realpath(directory));
  }

  private target(projectPath: string): string {
    return join(this.root, ...normalizeProjectPath(projectPath).split(PROJECT_SEPARATOR));
  }

  async read(projectPath: string): Promise<Uint8Array> {
    let resolved: string;
    try {
      resolved = await realpath(this.target(projectPath));
    } catch {
      throw new RexelError({
        reason: `File "${projectPath}" does not exist in the project folder`,
      });
    }
    assertInsideRoot(this.root, resolved, projectPath);
    return readFile(resolved);
  }

  async write(projectPath: string, data: Uint8Array): Promise<void> {
    const target = this.target(projectPath);
    await mkdir(dirname(target), { recursive: true });
    assertInsideRoot(this.root, join(await realpath(dirname(target)), "file"), projectPath);
    await writeFile(target, data);
  }

  async list(): Promise<string[]> {
    const found: string[] = [];
    const walk = async (directory: string) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (found.length >= MAX_LISTED_FILES) return;
        const path = join(directory, entry.name);
        if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) await walk(path);
        else if (entry.isFile())
          found.push(relative(this.root, path).split(sep).join(PROJECT_SEPARATOR));
      }
    };
    await walk(this.root);
    return found.sort();
  }
}
