import { mkdir, readdir, readFile, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ARCHIVE_PROJECT_ENTRY,
  archivedPaths,
  packProject,
  parseProject,
  RexelError,
  unpackProject,
} from "@rexel/core";
import { reporterFor, type GlobalOptions, type RootCommand } from "../cli-context.ts";
import { NodeProjectFileSystem } from "../node-project-file-system.ts";
import { assertWritable, exists, writeOutput } from "../output-file.ts";
import { STDIO } from "../project-input.ts";

type ArchiveOptions = GlobalOptions & {
  readonly output: string;
  readonly force?: true;
};

async function pack(projectArgument: string, options: ArchiveOptions) {
  const reporter = reporterFor(options);
  await assertWritable(options.output, options);
  const path = resolve(projectArgument);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new RexelError({ reason: `Cannot read project file "${projectArgument}"` });
  }
  const project = parseProject(text);
  const fileSystem = await NodeProjectFileSystem.open(dirname(path));
  const archive = await packProject(text, project, fileSystem);
  await writeOutput(options.output, archive, options.force ?? false);
  const files = archivedPaths(project);
  if (reporter.json) reporter.result({ ok: true, output: options.output, files });
  else if (options.output !== STDIO)
    reporter.info(`Wrote ${options.output} (${files.length + 1} files)`);
}

async function isEmptyDirectory(path: string): Promise<boolean> {
  return (await readdir(path)).length === 0;
}

async function unpack(archiveArgument: string, options: ArchiveOptions) {
  const reporter = reporterFor(options);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(resolve(archiveArgument));
  } catch {
    throw new RexelError({ reason: `Cannot read archive "${archiveArgument}"` });
  }
  const unpacked = unpackProject(bytes);
  parseProject(unpacked.projectText);
  const directory = resolve(options.output);
  if ((await exists(directory)) && !(await isEmptyDirectory(directory)) && !options.force) {
    throw new RexelError({
      reason: `"${options.output}" is not empty. Pass --force to write into it`,
    });
  }
  await mkdir(directory, { recursive: true });
  const fileSystem = await NodeProjectFileSystem.open(await realpath(directory));
  await fileSystem.write(ARCHIVE_PROJECT_ENTRY, new TextEncoder().encode(unpacked.projectText));
  for (const [path, data] of unpacked.files) await fileSystem.write(path, data);
  const files = [ARCHIVE_PROJECT_ENTRY, ...unpacked.files.keys()];
  if (reporter.json) reporter.result({ ok: true, output: options.output, files });
  else reporter.info(`Unpacked ${files.length} files into ${options.output}`);
}

export function registerArchiveCommands(program: RootCommand) {
  program
    .command("pack")
    .description("Bundle a project and the files it references into a .rxcp archive")
    .argument("<project>", "the .rxc file to pack")
    .requiredOption("-o, --output <file>", "the .rxcp file to write, or - to write to stdout")
    .option("--force", "overwrite the output file if it already exists")
    .action(async (projectArgument, _options, command) => {
      await pack(projectArgument, command.optsWithGlobals());
    });
  program
    .command("unpack")
    .description("Extract a .rxcp archive into a folder")
    .argument("<archive>", "the .rxcp file to unpack")
    .requiredOption("-o, --output <dir>", "the folder to extract into")
    .option("--force", "write into the folder even if it is not empty")
    .action(async (archiveArgument, _options, command) => {
      await unpack(archiveArgument, command.optsWithGlobals());
    });
}
