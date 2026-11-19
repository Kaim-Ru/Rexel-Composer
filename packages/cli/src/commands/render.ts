import { performance } from "node:perf_hooks";
import {
  applyParamOverrides,
  describeValue,
  encodePng,
  GraphEvaluator,
  isRasterData,
  OUTPUT_NODE_TYPE,
  ProjectGraph,
  Raster,
  RexelError,
  type ParamOverride,
} from "@rexel-composer/core";
import { reporterFor, type GlobalOptions, type RootCommand } from "../cli-context.ts";
import { assertWritable, writeOutput } from "../output-file.ts";
import { openProject, projectRegistry, STDIO } from "../project-input.ts";
import { UsageError } from "../usage-error.ts";
import { WorkerPool } from "../worker-pool.ts";

const OVERRIDE_PATTERN = /^([A-Za-z0-9_-]+)\.([^=]+)=(.*)$/s;
const MILLISECOND_DIGITS = 1;

type RenderOptions = GlobalOptions & {
  readonly output: string;
  readonly node?: string;
  readonly set?: string[];
  readonly force?: true;
  readonly allowPlugins?: true;
};

function collect(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

function parseOverride(raw: string): ParamOverride {
  const [, node, param, text] = OVERRIDE_PATTERN.exec(raw) ?? [];
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

async function render(projectArgument: string, options: RenderOptions) {
  const reporter = reporterFor(options);
  const overrides = (options.set ?? []).map(parseOverride);
  await assertWritable(options.output, options);
  const input = await openProject(projectArgument);
  const project = applyParamOverrides(input.project, overrides);
  const pool = new WorkerPool();
  try {
    const registry = await projectRegistry(
      { ...input, project },
      options.allowPlugins ?? false,
      pool,
    );
    const graph = ProjectGraph.build(project, registry);
    const target = pickTarget(graph, options.node);
    const total = graph.upstreamOf(target).size;
    const started = new Map<string, number>();
    let finished = 0;
    const evaluator = new GraphEvaluator(
      graph,
      { fileSystem: input.fileSystem, taskRunner: pool, pluginSandbox: pool },
      {
        listener: {
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
      },
    );
    const output = await evaluator.evaluatePrimary(target);
    reporter.endProgress();
    if (!isRasterData(output.value)) {
      throw new RexelError({
        node: target,
        reason: `The node outputs a ${output.type} (${describeValue(output.value)}), not an image`,
      });
    }
    const raster = Raster.from(output.value);
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
    await pool.close();
  }
}

export function registerRenderCommand(program: RootCommand) {
  program
    .command("render")
    .description("Render a node of a project to a PNG image")
    .argument("<project>", "the .rxc or .rxcp file to render, or - to read it from stdin")
    .requiredOption("-o, --output <file>", "the PNG file to write, or - to write to stdout")
    .option("--node <id>", `the node to render (default: the only ${OUTPUT_NODE_TYPE} node)`)
    .option(
      "--set <node.param=value>",
      "override a parameter, value parsed as JSON (repeatable)",
      collect,
    )
    .option("--force", "overwrite the output file if it already exists")
    .option(
      "--allow-plugins",
      "load the project's plugins (they run with full access to your computer)",
    )
    .action(async (projectArgument, _options, command) => {
      await render(projectArgument, command.optsWithGlobals());
    });
}
