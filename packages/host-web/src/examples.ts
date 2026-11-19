import { PROJECT_EXTENSION } from "@rexel-composer/core";

const EXAMPLES_ROOT = "../../../examples/";
const SEPARATOR = "/";

const exampleUrls = import.meta.glob<string>(
  ["../../../examples/**/*", "!../../../examples/out/**"],
  {
    query: "?url",
    import: "default",
    eager: true,
  },
);

export interface Example {
  readonly name: string;
  readonly projectPath: string;
  load: () => Promise<Map<string, Uint8Array>>;
}

function examplePaths(): Map<string, Map<string, string>> {
  const byExample = new Map<string, Map<string, string>>();
  for (const [modulePath, url] of Object.entries(exampleUrls)) {
    const [name, ...rest] = modulePath.slice(EXAMPLES_ROOT.length).split(SEPARATOR);
    if (name === undefined || rest.length === 0) continue;
    const files = byExample.get(name) ?? new Map<string, string>();
    files.set(rest.join(SEPARATOR), url);
    byExample.set(name, files);
  }
  return byExample;
}

export const EXAMPLES: readonly Example[] = [...examplePaths()].flatMap(([name, files]) => {
  const projectPath = [...files.keys()].find(
    (path) => path.endsWith(PROJECT_EXTENSION) && !path.includes(SEPARATOR),
  );
  if (projectPath === undefined) return [];
  return [
    {
      name,
      projectPath,
      load: async () =>
        new Map(
          await Promise.all(
            [...files].map(
              async ([path, url]) =>
                [path, new Uint8Array(await (await fetch(url)).arrayBuffer())] as const,
            ),
          ),
        ),
    },
  ];
});
