import { Command, CommanderError, Option } from "@commander-js/extra-typings";
import { RexelError } from "@rexel-composer/core";
import packageJson from "../package.json" with { type: "json" };
import { registerArchiveCommands } from "./commands/archive.ts";
import { registerInspectCommands, ValidationFailed } from "./commands/inspect.ts";
import { registerRenderCommand } from "./commands/render.ts";
import { reporterFor } from "./cli-context.ts";
import { ExitCode, UsageError } from "./usage-error.ts";

const COMMANDER_ERROR_PREFIX = /^error: /;

const program = new Command()
  .name("rexel")
  .description("Render and manage RexelComposer projects from the command line")
  .version(packageJson.version, "--version", "print the version")
  .helpOption("-h, --help", "show help")
  .addOption(new Option("--json", "print machine-readable JSON to stdout"))
  .addOption(new Option("-q, --quiet", "print nothing but errors").conflicts("verbose"))
  .addOption(new Option("-v, --verbose", "print per-node timings"))
  .showHelpAfterError("Run with --help for usage.")
  .exitOverride()
  .configureOutput({
    writeErr(message) {
      if (program.opts().json !== true) process.stderr.write(message);
    },
    outputError(message, write) {
      write(message);
    },
  });

registerRenderCommand(program);
registerArchiveCommands(program);
registerInspectCommands(program);

function exitCodeFor(error: unknown): ExitCode {
  const reporter = reporterFor(program.opts());
  if (error instanceof CommanderError) {
    if (error.exitCode === ExitCode.Success) return ExitCode.Success;
    if (reporter.json)
      reporter.error({ reason: error.message.replace(COMMANDER_ERROR_PREFIX, "") }, true);
    return ExitCode.UsageError;
  }
  if (error instanceof UsageError) {
    reporter.error({ reason: error.message }, true);
    return ExitCode.UsageError;
  }
  if (error instanceof ValidationFailed) return ExitCode.RuntimeError;
  reporter.error(RexelError.from(error).detail, false);
  return ExitCode.RuntimeError;
}

try {
  await program.parseAsync();
} catch (error) {
  process.exitCode = exitCodeFor(error);
}
