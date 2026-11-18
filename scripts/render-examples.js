import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

const EXAMPLES = "examples";
const OUTPUT = join(EXAMPLES, "out");
const CLI = join("packages", "cli", "dist", "main.js");
const PROJECT_EXTENSION = ".rxc";

mkdirSync(OUTPUT, { recursive: true });

const projects = readdirSync(EXAMPLES, { recursive: true, encoding: "utf8" })
  .filter((path) => path.endsWith(PROJECT_EXTENSION))
  .map((path) => join(EXAMPLES, path));

const failures = projects.filter((project) => {
  const output = join(OUTPUT, `${basename(project, PROJECT_EXTENSION)}.png`);
  const { status } = spawnSync(
    process.execPath,
    [CLI, "render", project, "-o", output, "--force", "--allow-plugins"],
    {
      stdio: "inherit",
    },
  );
  return status !== 0;
});

process.exitCode = failures.length === 0 ? 0 : 1;
