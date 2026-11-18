import { styleText } from "node:util";
import type { RexelErrorDetail } from "@rexel/core";

export interface ReporterOptions {
  readonly json: boolean;
  readonly quiet: boolean;
  readonly verbose: boolean;
}

const CLEAR_LINE = "\r\x1b[2K";

export class Reporter {
  private progressShown = false;

  constructor(private readonly options: ReporterOptions) {}

  get json(): boolean {
    return this.options.json;
  }

  info(message: string) {
    if (this.options.quiet) return;
    this.writeLine(message);
  }

  debug(message: string) {
    if (!this.options.verbose) return;
    this.writeLine(styleText("dim", message, { stream: process.stderr }));
  }

  progress(message: string) {
    if (this.options.quiet || this.options.json || !process.stderr.isTTY) return;
    process.stderr.write(CLEAR_LINE + message);
    this.progressShown = true;
  }

  result(value: unknown) {
    process.stdout.write(`${JSON.stringify(value)}\n`);
  }

  error(detail: RexelErrorDetail, usage: boolean) {
    if (this.options.json) {
      this.result({ ok: false, error: { ...detail, usage } });
      return;
    }
    const location = [
      detail.node === undefined ? undefined : `node "${detail.node}"`,
      detail.param === undefined ? undefined : `param "${detail.param}"`,
    ]
      .filter((part) => part !== undefined)
      .join(", ");
    const label = styleText(["bold", "red"], "error:", { stream: process.stderr });
    this.writeLine(`${label} ${detail.reason}${location === "" ? "" : ` (${location})`}`);
  }

  private writeLine(message: string) {
    if (this.progressShown) {
      process.stderr.write(CLEAR_LINE);
      this.progressShown = false;
    }
    process.stderr.write(`${message}\n`);
  }

  endProgress() {
    if (!this.progressShown) return;
    process.stderr.write(CLEAR_LINE);
    this.progressShown = false;
  }
}
