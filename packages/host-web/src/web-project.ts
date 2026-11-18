import {
  ARCHIVE_EXTENSION,
  createEmptyProject,
  parseProject,
  PROJECT_EXTENSION,
  unpackProject,
  type Project,
} from "@rexel/core";
import packageJson from "../package.json" with { type: "json" };
import { WebFileSystem } from "./web-file-system.ts";

const SEPARATOR = "/";
const NEW_PROJECT_NAME = "Untitled";
const decoder = new TextDecoder();

export const APP_VERSION = packageJson.version;

export interface LoadedProject {
  readonly project: Project;
  readonly fileSystem: WebFileSystem;
  readonly fileName: string;
}

function depth(path: string): number {
  return path.split(SEPARATOR).length;
}

function baseName(path: string): string {
  return path.split(SEPARATOR).at(-1) ?? path;
}

function parentOf(path: string): string[] {
  return path.split(SEPARATOR).slice(0, -1);
}

export function isProjectFile(path: string): boolean {
  return path.endsWith(PROJECT_EXTENSION) || path.endsWith(ARCHIVE_EXTENSION);
}

export function projectCandidates(paths: Iterable<string>): string[] {
  return [...paths]
    .filter(isProjectFile)
    .sort((left, right) => depth(left) - depth(right) || left.localeCompare(right));
}

export function newProject(): LoadedProject {
  return {
    project: createEmptyProject(NEW_PROJECT_NAME, APP_VERSION),
    fileSystem: new WebFileSystem(new Map(), undefined),
    fileName: `${NEW_PROJECT_NAME.toLowerCase()}${PROJECT_EXTENSION}`,
  };
}

export function loadArchive(bytes: Uint8Array, archiveName: string): LoadedProject {
  const { projectText, files } = unpackProject(bytes);
  return {
    project: parseProject(projectText),
    fileSystem: new WebFileSystem(files, undefined),
    fileName: `${baseName(archiveName).slice(0, -ARCHIVE_EXTENSION.length)}${PROJECT_EXTENSION}`,
  };
}

export async function loadFromFiles(
  files: ReadonlyMap<string, Blob | Uint8Array>,
  projectPath: string,
): Promise<LoadedProject> {
  const source = files.get(projectPath);
  if (source === undefined) throw new Error(`"${projectPath}" was not found`);
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(await source.arrayBuffer());
  if (projectPath.endsWith(ARCHIVE_EXTENSION)) return loadArchive(bytes, projectPath);
  const prefix = parentOf(projectPath)
    .map((segment) => `${segment}${SEPARATOR}`)
    .join("");
  const rebased = new Map(
    [...files]
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, data]) => [path.slice(prefix.length), data]),
  );
  return {
    project: parseProject(decoder.decode(bytes)),
    fileSystem: new WebFileSystem(rebased, undefined),
    fileName: baseName(projectPath),
  };
}

export async function directoryCandidates(root: FileSystemDirectoryHandle): Promise<string[]> {
  const fileSystem = new WebFileSystem(new Map(), root);
  return projectCandidates(await fileSystem.list());
}

export async function loadFromDirectory(
  root: FileSystemDirectoryHandle,
  projectPath: string,
): Promise<LoadedProject> {
  let directory = root;
  for (const segment of parentOf(projectPath))
    directory = await directory.getDirectoryHandle(segment);
  const fileName = baseName(projectPath);
  const bytes = new Uint8Array(
    await (await (await directory.getFileHandle(fileName)).getFile()).arrayBuffer(),
  );
  if (fileName.endsWith(ARCHIVE_EXTENSION)) return loadArchive(bytes, fileName);
  return {
    project: parseProject(decoder.decode(bytes)),
    fileSystem: new WebFileSystem(new Map(), directory),
    fileName,
  };
}
