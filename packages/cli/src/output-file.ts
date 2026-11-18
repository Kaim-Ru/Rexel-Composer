import { access, writeFile } from "node:fs/promises";
import { RexelError } from "@rexel/core";
import { STDIO } from "./project-input.ts";
import { UsageError } from "./usage-error.ts";

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function assertWritable(output: string, options: { force?: true; json?: true }) {
  if (output === STDIO) {
    if (options.json) throw new UsageError("--json cannot be combined with -o -");
    if (process.stdout.isTTY) {
      throw new UsageError(
        "Refusing to write binary data to the terminal. Redirect stdout or use -o <file>",
      );
    }
    return;
  }
  if (!options.force && (await exists(output))) {
    throw new RexelError({ reason: `"${output}" already exists. Pass --force to overwrite it` });
  }
}

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : String(error);
}

export async function writeOutput(output: string, data: Uint8Array, force: boolean) {
  if (output === STDIO) {
    process.stdout.write(data);
    return;
  }
  try {
    await writeFile(output, data, { flag: force ? "w" : "wx" });
  } catch (error) {
    throw new RexelError({ reason: `Cannot write "${output}": ${errorCode(error)}` });
  }
}
