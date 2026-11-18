# rexel-composer

Command-line renderer for [RexelComposer](https://github.com/Kaim-Ru/Rexel-Composer) projects. It turns `.rxc` node graphs and `.rxcp` archives into PNG with the same engine as the web app and the VS Code extension.

```sh
npx rexel-composer render project.rxc -o out.png
```

After a global install (`npm install -g rexel-composer`) the command is `rexel`.

| Command                                  | What it does                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `rexel render <project> -o <out.png>`    | Render the Output node, or another node with `--node <id>`. `--set node.param=value` overrides a parameter |
| `rexel validate <project>`               | Check the schema, node definitions, links and paths                                                        |
| `rexel info <project>`                   | List nodes, assets and plugins                                                                             |
| `rexel nodes`                            | List node types with their ports and parameters                                                            |
| `rexel schema`                           | Print the JSON Schema of `.rxc`                                                                            |
| `rexel pack <project.rxc> -o <out.rxcp>` | Bundle a project with the files it references                                                              |
| `rexel unpack <project.rxcp> -o <dir>`   | Extract an archive                                                                                         |

Every command accepts `--json` and then prints exactly one JSON document on stdout. Exit codes are 0 for success, 1 for an invalid project or failed render, and 2 for a usage error.

Projects with plugins render only with `--allow-plugins`, because plugins run with full access to your computer.

Requires Node.js 22.13 or later.
