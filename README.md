# RexelComposer

A node-based compositor for pixel art and small images, rebuilt for the web from the ideas of Pixel Composer. You connect nodes such as noise, blur, palette reduction and blend, see the result live, and export PNG. Every window onto a project uses the same engine and produces the same pixels:

- **Web app**: https://kaim-ru.github.io/Rexel-Composer/ (installable as a PWA and works offline)
- **VS Code extension**: opens `.rxc` and `.rxcp` files in an editor tab. Install [RexelComposer from the Marketplace](https://marketplace.visualstudio.com/items?itemName=kaim-ru.rexel-composer-vscode) or run `code --install-extension kaim-ru.rexel-composer-vscode`
- **CLI**: `rexel render project.rxc -o out.png`

## Project files

- `.rxc` is a JSON node graph. It references images, palettes and plugins by paths relative to itself.
- `.rxcp` is a zip of a `project.rxc` and the files it references, for sharing a project as one file.

The full format is in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), and `rexel schema` prints its JSON Schema.

## CLI

Install it from npm (Node 22.13 or later), or run it once with `npx rexel-composer`:

```sh
npm install -g rexel-composer
rexel render examples/blur/blur.rxc -o blur.png
rexel validate project.rxc --json
rexel nodes
```

Commands: `render`, `validate`, `info`, `nodes`, `schema`, `pack`, `unpack`. Run `rexel <command> --help` for options.

## AI agents

[skills/rexel-composer](skills/rexel-composer/SKILL.md) is an Agent Skill that teaches an agent to write `.rxc` files and check them with the CLI. Its node reference is generated from the node definitions with `pnpm skill`.

## Plugins

A plugin is a self-contained ES module in the project folder whose default export is `{ apiVersion: 1, nodes: [...] }`. Write it in TypeScript with the types and `definePlugin` helper from [`@rexel-composer/plugin-api`](https://www.npmjs.com/package/@rexel-composer/plugin-api), then bundle it to one file. See [examples/plugin](examples/plugin). The web app and VS Code ask before running a project's plugins and run them in a worker with no network access. The CLI loads them only with `--allow-plugins`.

## Development

Requires Node 22.13+ and pnpm 10.

```sh
pnpm install
pnpm build              # CLI, web app and VS Code extension
pnpm typecheck
pnpm lint
pnpm render:examples    # render every example into examples/out/
pnpm --filter @rexel-composer/host-web dev
pnpm --filter rexel-composer-vscode package   # writes dist/rexel-composer.vsix
```

| Package                | Role                                                  |
| ---------------------- | ----------------------------------------------------- |
| `packages/plugin-api`  | Types for plugin authors                              |
| `packages/core`        | Node graph, evaluator, image processing, file formats |
| `packages/viewmodel`   | Editor state, commands, undo / redo, preview          |
| `packages/ui`          | React editor shared by the web app and VS Code        |
| `packages/host-web`    | Web app and PWA                                       |
| `packages/host-vscode` | VS Code custom editor                                 |
| `packages/cli`         | `rexel` command (`rexel-composer` on npm)             |

## License

MIT
