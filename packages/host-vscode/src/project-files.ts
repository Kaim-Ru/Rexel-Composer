import { realpath } from "node:fs/promises";
import { assertInsideRoot, normalizeProjectPath, RexelError } from "@rexel/core";
import * as vscode from "vscode";

const SEPARATOR = "/";
const FILE_SCHEME = "file";
const ASSET_FOLDER = "assets";

export interface ProjectFiles {
  read: (path: string) => Promise<Uint8Array>;
  list: () => Promise<string[]>;
  importFile: (source: vscode.Uri) => Promise<string>;
  readonly folder: vscode.Uri;
}

function joinProjectPath(base: vscode.Uri, projectPath: string): vscode.Uri {
  return vscode.Uri.joinPath(base, ...normalizeProjectPath(projectPath).split(SEPARATOR));
}

function baseName(uri: vscode.Uri): string {
  return uri.path.split(SEPARATOR).at(-1) ?? "asset";
}

export function uniqueAssetPath(name: string, taken: ReadonlySet<string>): string {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, "_");
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const extension = dot > 0 ? safe.slice(dot) : "";
  for (let index = 1; ; index++) {
    const candidate = `${ASSET_FOLDER}${SEPARATOR}${index === 1 ? stem : `${stem}-${index}`}${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}

async function listFolder(root: vscode.Uri, prefix: string, into: string[]) {
  for (const [name, type] of await vscode.workspace.fs.readDirectory(
    vscode.Uri.joinPath(root, prefix),
  )) {
    const path = prefix === "" ? name : `${prefix}${SEPARATOR}${name}`;
    if ((type & vscode.FileType.Directory) !== 0) await listFolder(root, path, into);
    else into.push(path);
  }
}

export class FolderProjectFiles implements ProjectFiles {
  constructor(readonly folder: vscode.Uri) {}

  async read(path: string): Promise<Uint8Array> {
    const target = joinProjectPath(this.folder, path);
    if (target.scheme === FILE_SCHEME) {
      try {
        assertInsideRoot(await realpath(this.folder.fsPath), await realpath(target.fsPath), path);
      } catch (error) {
        if (error instanceof RexelError) throw error;
        throw new RexelError({ reason: `File "${path}" does not exist in the project folder` });
      }
    }
    return vscode.workspace.fs.readFile(target);
  }

  async list(): Promise<string[]> {
    const found: string[] = [];
    await listFolder(this.folder, "", found);
    return found.sort();
  }

  async importFile(source: vscode.Uri): Promise<string> {
    const folderPath = `${this.folder.path}${SEPARATOR}`;
    if (source.scheme === this.folder.scheme && source.path.startsWith(folderPath)) {
      const relative = source.path.slice(folderPath.length);
      await this.read(relative);
      return relative;
    }
    const path = uniqueAssetPath(baseName(source), new Set(await this.list()));
    await vscode.workspace.fs.writeFile(
      joinProjectPath(this.folder, path),
      await vscode.workspace.fs.readFile(source),
    );
    return path;
  }
}

export class ArchiveProjectFiles implements ProjectFiles {
  constructor(
    readonly folder: vscode.Uri,
    readonly files: Map<string, Uint8Array>,
  ) {}

  read(path: string): Promise<Uint8Array> {
    const data = this.files.get(normalizeProjectPath(path));
    if (data === undefined) {
      return Promise.reject(new RexelError({ reason: `File "${path}" is not in the archive` }));
    }
    return Promise.resolve(data);
  }

  list(): Promise<string[]> {
    return Promise.resolve([...this.files.keys()].sort());
  }

  async importFile(source: vscode.Uri): Promise<string> {
    const path = uniqueAssetPath(baseName(source), new Set(this.files.keys()));
    this.files.set(path, await vscode.workspace.fs.readFile(source));
    return path;
  }
}
