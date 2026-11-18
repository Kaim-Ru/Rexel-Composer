const SEPARATOR = "/";

export function download(data: Uint8Array | string, fileName: string, type: string) {
  const blob = new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  });
}

export function pickFiles(options: { accept?: string; directory?: boolean }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (options.accept !== undefined) input.accept = options.accept;
    if (options.directory === true) input.webkitdirectory = true;
    input.addEventListener("change", () => {
      resolve([...(input.files ?? [])]);
    });
    input.addEventListener("cancel", () => {
      resolve([]);
    });
    input.click();
  });
}

export function filesByRelativePath(files: readonly File[]): Map<string, File> {
  return new Map(
    files.map((file) => {
      const relative = file.webkitRelativePath === "" ? file.name : file.webkitRelativePath;
      return [
        relative
          .split(SEPARATOR)
          .slice(file.webkitRelativePath === "" ? 0 : 1)
          .join(SEPARATOR),
        file,
      ];
    }),
  );
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

async function collectEntry(entry: FileSystemEntry, prefix: string, into: Map<string, File>) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    into.set(`${prefix}${entry.name}`, file);
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (let batch = await readEntries(reader); batch.length > 0; batch = await readEntries(reader)) {
    for (const child of batch)
      await collectEntry(child, `${prefix}${entry.name}${SEPARATOR}`, into);
  }
}

export type Dropped =
  | { readonly kind: "directory"; readonly handle: FileSystemDirectoryHandle }
  | { readonly kind: "files"; readonly files: Map<string, File> };

export async function readDrop(transfer: DataTransfer): Promise<Dropped | undefined> {
  const items = [...transfer.items].filter((item) => item.kind === "file");
  const entries = items.map((item) => item.webkitGetAsEntry()).filter((entry) => entry !== null);
  const single = items.length === 1 ? items[0] : undefined;
  const handlePromise = single?.getAsFileSystemHandle?.();
  const handle = await handlePromise;
  if (handle?.kind === "directory")
    return { kind: "directory", handle: handle as FileSystemDirectoryHandle };
  const files = new Map<string, File>();
  for (const entry of entries) await collectEntry(entry, "", files);
  const [onlyEntry] = entries;
  if (entries.length === 1 && onlyEntry?.isDirectory === true) {
    const root = `${onlyEntry.name}${SEPARATOR}`;
    return {
      kind: "files",
      files: new Map([...files].map(([path, file]) => [path.slice(root.length), file])),
    };
  }
  return files.size === 0 ? undefined : { kind: "files", files };
}
