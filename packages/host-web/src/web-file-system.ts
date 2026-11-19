import { normalizeProjectPath, RexelError, type ProjectFileSystem } from "@rexel-composer/core";

const SEPARATOR = "/";

export type FileSource = ReadonlyMap<string, Blob | Uint8Array>;

async function readSource(source: Blob | Uint8Array): Promise<Uint8Array> {
  return source instanceof Uint8Array ? source : new Uint8Array(await source.arrayBuffer());
}

async function directoryOf(
  root: FileSystemDirectoryHandle,
  segments: readonly string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let directory = root;
  for (const segment of segments)
    directory = await directory.getDirectoryHandle(segment, { create });
  return directory;
}

async function walk(directory: FileSystemDirectoryHandle, prefix: string, into: string[]) {
  for await (const [name, handle] of directory.entries()) {
    const path = `${prefix}${name}`;
    if (handle.kind === "file") into.push(path);
    else await walk(handle, `${path}${SEPARATOR}`, into);
  }
}

export class WebFileSystem implements ProjectFileSystem {
  readonly pending = new Map<string, Uint8Array>();

  constructor(
    private files: FileSource,
    private target: FileSystemDirectoryHandle | undefined,
  ) {}

  get directory(): FileSystemDirectoryHandle | undefined {
    return this.target;
  }

  async read(projectPath: string): Promise<Uint8Array> {
    const path = normalizeProjectPath(projectPath);
    const written = this.pending.get(path);
    if (written !== undefined) return written;
    const source = this.files.get(path);
    if (source !== undefined) return readSource(source);
    if (this.target !== undefined) {
      const segments = path.split(SEPARATOR);
      const name = segments.pop() ?? path;
      try {
        const handle = await (await directoryOf(this.target, segments, false)).getFileHandle(name);
        return new Uint8Array(await (await handle.getFile()).arrayBuffer());
      } catch {
        throw new RexelError({
          reason: `File "${projectPath}" does not exist in the project folder`,
        });
      }
    }
    throw new RexelError({ reason: `File "${projectPath}" does not exist in the project folder` });
  }

  write(projectPath: string, data: Uint8Array): Promise<void> {
    this.pending.set(normalizeProjectPath(projectPath), data);
    return Promise.resolve();
  }

  async list(): Promise<string[]> {
    const paths = new Set([...this.files.keys(), ...this.pending.keys()]);
    if (this.target !== undefined) {
      const found: string[] = [];
      await walk(this.target, "", found);
      for (const path of found) paths.add(path);
    }
    return [...paths].sort();
  }

  async flush(target: FileSystemDirectoryHandle, extra: ReadonlyMap<string, Uint8Array>) {
    for (const [path, data] of [...this.pending, ...extra]) {
      const segments = path.split(SEPARATOR);
      const name = segments.pop() ?? path;
      const handle = await (
        await directoryOf(target, segments, true)
      ).getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(data as Uint8Array<ArrayBuffer>);
      await writable.close();
    }
    this.pending.clear();
    this.files = new Map();
    this.target = target;
  }
}
