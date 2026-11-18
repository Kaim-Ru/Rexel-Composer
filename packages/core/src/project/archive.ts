import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { RexelError } from "../errors.ts";
import type { ProjectFileSystem } from "../host.ts";
import { normalizeProjectPath } from "./paths.ts";
import type { Project } from "./schema.ts";

export const ARCHIVE_PROJECT_ENTRY = "project.rxc";
const MAX_ARCHIVE_BYTES = 1_073_741_824;
const DIRECTORY_SUFFIX = "/";

export function archivedPaths(project: Project): string[] {
  return [
    ...new Set([
      ...project.assets.map((asset) => asset.path),
      ...project.plugins.map((plugin) => plugin.path),
    ]),
  ];
}

export async function packProject(
  projectText: string,
  project: Project,
  fileSystem: ProjectFileSystem,
): Promise<Uint8Array> {
  const entries: Zippable = { [ARCHIVE_PROJECT_ENTRY]: strToU8(projectText) };
  for (const path of archivedPaths(project)) {
    if (path === ARCHIVE_PROJECT_ENTRY) {
      throw new RexelError({
        reason: `"${ARCHIVE_PROJECT_ENTRY}" is reserved for the project file in .rxcp`,
      });
    }
    try {
      entries[path] = await fileSystem.read(path);
    } catch (error) {
      throw new RexelError({ reason: `Cannot pack "${path}": ${RexelError.from(error).message}` });
    }
  }
  return zipSync(entries);
}

export interface UnpackedProject {
  readonly projectText: string;
  readonly files: Map<string, Uint8Array>;
}

export function unpackProject(bytes: Uint8Array): UnpackedProject {
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => {
        total += file.originalSize;
        if (total > MAX_ARCHIVE_BYTES) {
          throw new RexelError({
            reason: `The archive expands to more than ${MAX_ARCHIVE_BYTES} bytes`,
          });
        }
        return !file.name.endsWith(DIRECTORY_SUFFIX);
      },
    });
  } catch (error) {
    throw error instanceof RexelError
      ? error
      : new RexelError({
          reason: `The file is not a valid .rxcp archive: ${RexelError.from(error).message}`,
        });
  }
  const files = new Map<string, Uint8Array>();
  let projectText: string | undefined;
  for (const [name, data] of Object.entries(entries)) {
    const path = normalizeProjectPath(name);
    if (path === ARCHIVE_PROJECT_ENTRY) projectText = strFromU8(data);
    else files.set(path, data);
  }
  if (projectText === undefined) {
    throw new RexelError({ reason: `The archive has no ${ARCHIVE_PROJECT_ENTRY} at its root` });
  }
  return { projectText, files };
}
