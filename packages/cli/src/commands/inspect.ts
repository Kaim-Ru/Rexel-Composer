import {
  createCoreRegistry,
  describeNodes,
  projectJsonSchema,
  RexelError,
  validateProject,
  type RexelErrorDetail,
} from "@rexel-composer/core";
import { reporterFor, type GlobalOptions, type RootCommand } from "../cli-context.ts";
import { openProject, projectRegistry } from "../project-input.ts";
import { WorkerPool } from "../worker-pool.ts";

type ProjectOptions = GlobalOptions & {
  readonly allowPlugins?: true;
};

export class ValidationFailed extends Error {
  constructor(readonly count: number) {
    super(`${count} problem${count === 1 ? "" : "s"} found`);
  }
}

async function validate(projectArgument: string, options: ProjectOptions) {
  const reporter = reporterFor(options);
  const pool = new WorkerPool();
  let errors: RexelErrorDetail[];
  try {
    const input = await openProject(projectArgument);
    const registry = await projectRegistry(input, options.allowPlugins ?? false, pool);
    errors = await validateProject(input.project, input.fileSystem, registry);
  } catch (error) {
    errors = [RexelError.from(error).detail];
  } finally {
    await pool.close();
  }
  if (reporter.json) {
    reporter.result({ ok: errors.length === 0, errors });
  } else if (errors.length === 0) {
    reporter.info(`${projectArgument} is valid`);
  } else {
    for (const error of errors) reporter.error(error, false);
  }
  if (errors.length > 0) throw new ValidationFailed(errors.length);
}

async function info(projectArgument: string, options: GlobalOptions) {
  const reporter = reporterFor(options);
  const { project } = await openProject(projectArgument);
  const summary = {
    name: project.meta.name,
    canvas: project.canvas,
    nodes: project.nodes.map((node) => ({ id: node.id, type: node.type })),
    links: project.links.length,
    assets: project.assets.map((asset) => ({ id: asset.id, kind: asset.kind, path: asset.path })),
    plugins: project.plugins.map((plugin) => ({
      id: plugin.id,
      version: plugin.version,
      path: plugin.path,
    })),
  };
  if (reporter.json) {
    reporter.result(summary);
    return;
  }
  const lines = [
    `${summary.name} (${summary.canvas.width}x${summary.canvas.height})`,
    `Nodes (${summary.nodes.length})`,
    ...summary.nodes.map((node) => `  ${node.id}  ${node.type}`),
    `Links (${summary.links})`,
    `Assets (${summary.assets.length})`,
    ...summary.assets.map((asset) => `  ${asset.id}  ${asset.kind}  ${asset.path}`),
    `Plugins (${summary.plugins.length})`,
    ...summary.plugins.map((plugin) => `  ${plugin.id}  ${plugin.version}  ${plugin.path}`),
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

function nodes(options: GlobalOptions) {
  const reporter = reporterFor(options);
  const definitions = describeNodes(createCoreRegistry());
  if (reporter.json) {
    reporter.result(definitions);
    return;
  }
  const lines = definitions.flatMap((definition) => [
    `${definition.type}  ${definition.title}`,
    ...Object.entries(definition.inputs).map(([name, type]) => `  in   ${name}: ${type}`),
    ...Object.entries(definition.outputs).map(([name, type]) => `  out  ${name}: ${type}`),
    ...Object.entries(definition.params).map(
      ([name, spec]) => `  param ${name}: ${JSON.stringify(spec)}`,
    ),
  ]);
  process.stdout.write(`${lines.join("\n")}\n`);
}

export function registerInspectCommands(program: RootCommand) {
  program
    .command("validate")
    .description("Check a project against the schema, the node definitions and the path rules")
    .argument("<project>", "the .rxc or .rxcp file to check, or - to read it from stdin")
    .option("--allow-plugins", "load the project's plugins so their nodes can be checked")
    .action(async (projectArgument, _options, command) => {
      await validate(projectArgument, command.optsWithGlobals());
    });
  program
    .command("info")
    .description("List the nodes, assets and plugins of a project")
    .argument("<project>", "the .rxc or .rxcp file to describe, or - to read it from stdin")
    .action(async (projectArgument, _options, command) => {
      await info(projectArgument, command.optsWithGlobals());
    });
  program
    .command("nodes")
    .description("List the built-in node types with their ports and parameters")
    .action((_options, command) => {
      nodes(command.optsWithGlobals());
    });
  program
    .command("schema")
    .description("Print the JSON Schema of .rxc files")
    .action(() => {
      process.stdout.write(`${JSON.stringify(projectJsonSchema(), null, 2)}\n`);
    });
}
