import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ARCHIVE_EXTENSION,
  createProjectRegistry,
  MemoryFileSystem,
  parseProject,
  RexelError,
  unpackProject,
  type NodeRegistry,
  type Project,
  type ProjectFileSystem,
} from "@rexel-composer/core";
import { NodeProjectFileSystem } from "./node-project-file-system.ts";
import type { WorkerPool } from "./worker-pool.ts";

export const STDIO = "-";
const ZIP_MAGIC_FIRST = 0x50;
const ZIP_MAGIC_SECOND = 0x4b;
const ZIP_MAGIC = [ZIP_MAGIC_FIRST, ZIP_MAGIC_SECOND] as const;

export interface ProjectInput {
  readonly project: Project;
  readonly text: string;
  readonly fileSystem: ProjectFileSystem;
}

async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

function isZip(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((byte, index) => bytes[index] === byte);
}

async function readInput(argument: string): Promise<{ bytes: Uint8Array; root: string }> {
  if (argument === STDIO) return { bytes: await readStdin(), root: process.cwd() };
  const path = resolve(argument);
  try {
    return { bytes: await readFile(path), root: dirname(path) };
  } catch {
    throw new RexelError({ reason: `Cannot read project file "${argument}"` });
  }
}

export async function openProject(argument: string): Promise<ProjectInput> {
  const { bytes, root } = await readInput(argument);
  if (isZip(bytes) || argument.endsWith(ARCHIVE_EXTENSION)) {
    const unpacked = unpackProject(bytes);
    return {
      text: unpacked.projectText,
      project: parseProject(unpacked.projectText),
      fileSystem: new MemoryFileSystem(unpacked.files),
    };
  }
  const text = Buffer.from(bytes).toString("utf8");
  return { text, project: parseProject(text), fileSystem: await NodeProjectFileSystem.open(root) };
}

export async function projectRegistry(
  input: ProjectInput,
  allowPlugins: boolean,
  pool: WorkerPool,
): Promise<NodeRegistry> {
  if (input.project.plugins.length > 0 && !allowPlugins) {
    throw new RexelError({
      reason: `This project uses plugins (${input.project.plugins.map((plugin) => plugin.id).join(", ")}). Plugins run with full access to your computer; pass --allow-plugins if you trust them`,
    });
  }
  return createProjectRegistry(input.project, input.fileSystem, allowPlugins ? pool : undefined);
}
