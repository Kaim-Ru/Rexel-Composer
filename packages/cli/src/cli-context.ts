import type { Command, OptionValues } from "@commander-js/extra-typings";
import { Reporter } from "./reporter.ts";

export interface GlobalOptions extends OptionValues {
  readonly json?: true;
  readonly quiet?: true;
  readonly verbose?: true;
}

export type RootCommand = Command<[], GlobalOptions>;

export function reporterFor(options: GlobalOptions): Reporter {
  return new Reporter({
    json: options.json ?? false,
    quiet: options.quiet ?? false,
    verbose: options.verbose ?? false,
  });
}
