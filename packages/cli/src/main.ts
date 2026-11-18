import { Command, CommanderError, Option } from "@commander-js/extra-typings";
import { RexelError } from "@rexel/core";
import packageJson from "../package.json" with { type: "json" };
import { registerRenderCommand } from "./commands/render.ts";
import { Reporter } from "./reporter.ts";
import { ExitCode, UsageError } from "./usage-error.ts";

const COMMANDER_ERROR_PREFIX = /^error: /;

const program = new Command()
  .name("rexel")
  .description("Render RexelComposer projects from the command line")
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

function reporter(): Reporter {
  const options = program.opts();
  return new Reporter({
    json: options.json ?? false,
    quiet: options.quiet ?? false,
    verbose: options.verbose ?? false,
  });
}

function exitCodeFor(error: unknown): ExitCode {
  if (error instanceof CommanderError) {
    if (error.exitCode === ExitCode.Success) return ExitCode.Success;
    if (reporter().json) {
      reporter().error({ reason: error.message.replace(COMMANDER_ERROR_PREFIX, "") }, true);
    }
    return ExitCode.UsageError;
  }
  if (error instanceof UsageError) {
    reporter().error({ reason: error.message }, true);
    return ExitCode.UsageError;
  }
  reporter().error(RexelError.from(error).detail, false);
  return ExitCode.RuntimeError;
}

try {
  await program.parseAsync();
} catch (error) {
  process.exitCode = exitCodeFor(error);
}
