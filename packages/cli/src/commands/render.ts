import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type { Command } from "@commander-js/extra-typings";
import {
  applyParamOverrides,
  createCoreRegistry,
  encodePng,
  GraphEvaluator,
  OUTPUT_NODE_TYPE,
  parseProject,
  ProjectGraph,
  RexelError,
  type ParamOverride,
} from "@rexel/core";
import { NodeProjectFileSystem } from "../node-project-file-system.ts";
import { Reporter } from "../reporter.ts";
import { UsageError } from "../usage-error.ts";
import { WorkerTaskRunner } from "../worker-task-runner.ts";

const STDIO = "-";
const OVERRIDE_PATTERN = /^([A-Za-z0-9_-]+)\.([^=]+)=(.*)$/s;
const MILLISECOND_DIGITS = 1;

interface RenderOptions {
  readonly output: string;
  readonly node?: string;
  readonly set?: string[];
  readonly force?: true;
  readonly json?: true;
  readonly quiet?: true;
  readonly verbose?: true;
}

function collect(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

function parseOverride(raw: string): ParamOverride {
  const match = OVERRIDE_PATTERN.exec(raw);
  const [, node, param, text] = match ?? [];
  if (node === undefined || param === undefined || text === undefined) {
    throw new UsageError(`--set expects <node>.<param>=<value>, got "${raw}"`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  return { node, param, value };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8");
}

async function readProject(argument: string): Promise<{ text: string; root: string }> {
  if (argument === STDIO) return { text: await readStdin(), root: process.cwd() };
  const path = resolve(argument);
  try {
    return { text: await readFile(path, "utf8"), root: dirname(path) };
  } catch {
    throw new RexelError({ reason: `Cannot read project file "${argument}"` });
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function assertWritable(output: string, options: RenderOptions) {
  if (output === STDIO) {
    if (options.json) throw new UsageError("--json cannot be combined with -o -");
    if (process.stdout.isTTY) {
      throw new UsageError(
        "Refusing to write a PNG to the terminal. Redirect stdout or use -o <file>",
      );
    }
    return;
  }
  if (!options.force && (await exists(output))) {
    throw new RexelError({ reason: `"${output}" already exists. Pass --force to overwrite it` });
  }
}

function pickTarget(graph: ProjectGraph, requested: string | undefined): string {
  if (requested !== undefined) return graph.get(requested).id;
  const outputs = graph.idsOfType(OUTPUT_NODE_TYPE);
  const [only] = outputs;
  if (only === undefined) {
    throw new UsageError(
      `The project has no ${OUTPUT_NODE_TYPE} node. Choose one with --node <id>`,
    );
  }
  if (outputs.length > 1) {
    throw new UsageError(
      `The project has ${outputs.length} ${OUTPUT_NODE_TYPE} nodes (${outputs.join(", ")}). Choose one with --node <id>`,
    );
  }
  return only;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException & { code: string } {
  return error instanceof Error && typeof (error as NodeJS.ErrnoException).code === "string";
}

async function writeOutput(output: string, png: Uint8Array, force: boolean) {
  if (output === STDIO) {
    process.stdout.write(png);
    return;
  }
  try {
    await writeFile(output, png, { flag: force ? "w" : "wx" });
  } catch (error) {
    const reason = isErrnoException(error) ? error.code : String(error);
    throw new RexelError({ reason: `Cannot write "${output}": ${reason}` });
  }
}

async function render(projectArgument: string, options: RenderOptions) {
  const reporter = new Reporter({
    json: options.json ?? false,
    quiet: options.quiet ?? false,
    verbose: options.verbose ?? false,
  });
  const overrides = (options.set ?? []).map(parseOverride);
  await assertWritable(options.output, options);
  const { text, root } = await readProject(projectArgument);
  const project = applyParamOverrides(parseProject(text), overrides);
  const graph = ProjectGraph.build(project, createCoreRegistry());
  const target = pickTarget(graph, options.node);
  const total = graph.upstreamOf(target).size;
  const started = new Map<string, number>();
  let finished = 0;
  const taskRunner = new WorkerTaskRunner();
  try {
    const evaluator = new GraphEvaluator(
      graph,
      { project, fileSystem: await NodeProjectFileSystem.open(root), taskRunner },
      {
        nodeStarted(id) {
          started.set(id, performance.now());
          reporter.progress(`Rendering ${finished + 1}/${total} ${id}`);
        },
        nodeFinished(id) {
          finished++;
          const elapsed = performance.now() - (started.get(id) ?? performance.now());
          reporter.debug(`${id} ${elapsed.toFixed(MILLISECOND_DIGITS)} ms`);
        },
      },
    );
    const raster = await evaluator.evaluateImage(target);
    reporter.endProgress();
    await writeOutput(options.output, encodePng(raster), options.force ?? false);
    if (reporter.json) {
      reporter.result({
        ok: true,
        output: options.output,
        node: target,
        width: raster.width,
        height: raster.height,
      });
    } else if (options.output !== STDIO) {
      reporter.info(`Wrote ${options.output} (${raster.width}x${raster.height})`);
    }
  } finally {
    reporter.endProgress();
    await taskRunner.close();
  }
}

export function registerRenderCommand(
  program: Command<[], { json?: true; quiet?: true; verbose?: true }>,
) {
  program
    .command("render")
    .description("Render a node of a project to a PNG image")
    .argument("<project>", "the .rxc file to render, or - to read it from stdin")
    .requiredOption("-o, --output <file>", "the PNG file to write, or - to write to stdout")
    .option("--node <id>", `the node to render (default: the only ${OUTPUT_NODE_TYPE} node)`)
    .option(
      "--set <node.param=value>",
      "override a parameter, value parsed as JSON (repeatable)",
      collect,
    )
    .option("--force", "overwrite the output file if it already exists")
    .action(async (projectArgument, _options, command) => {
      await render(projectArgument, command.optsWithGlobals());
    });
}
