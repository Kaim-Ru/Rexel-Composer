---
name: rexel-composer
description: Create, edit, validate and render RexelComposer projects (.rxc node graphs for pixel art and image processing, .rxcp archives) with the `rexel` CLI. Use when asked to build an image-processing pipeline, generate pixel art procedurally, edit a .rxc file, or render one to PNG.
---

# RexelComposer

A RexelComposer project is a node graph saved as a `.rxc` file (UTF-8 JSON). Nodes generate or process Float32 RGBA images; links carry images and values between them. The `rexel` CLI checks and renders projects without the editor.

## Running the CLI

- Installed: `npm install -g rexel-composer`, then `rexel <command>`
- Without installing: `npx rexel-composer <command>`
- Inside this repository: `pnpm build` once, then `pnpm rexel <command>`

## Workflow

1. Write or edit the `.rxc` file.
2. Run `rexel validate project.rxc --json`. It prints `{"ok": true, "errors": []}` or a list of errors, each with `reason` and, when known, `node` and `param`. The exit code is 1 when the project is invalid.
3. Fix every reported error and validate again until `ok` is `true`.
4. Run `rexel render project.rxc -o out.png --force`, then look at the PNG.

Use `--json` on any command to get exactly one JSON document on stdout. Exit codes: 0 success, 1 invalid project or failed render, 2 usage error.

## File structure

Every key below is required, and unknown keys are errors.

```json
{
  "formatVersion": 1,
  "meta": { "name": "Example", "appVersion": "0.1.0" },
  "canvas": { "width": 64, "height": 64 },
  "nodes": [
    {
      "id": "noise",
      "type": "core.noise",
      "position": { "x": 0, "y": 0 },
      "params": { "scale": 6, "seed": 3 }
    },
    {
      "id": "colors",
      "type": "core.palette",
      "position": { "x": 240, "y": 0 },
      "params": { "colors": ["#1a1c2cff", "#5d275dff", "#b13e53ff", "#ef7d57ff", "#ffcd75ff"] }
    },
    { "id": "out", "type": "core.output", "position": { "x": 480, "y": 0 } }
  ],
  "links": [
    { "from": { "node": "noise", "port": "image" }, "to": { "node": "colors", "port": "image" } },
    { "from": { "node": "colors", "port": "image" }, "to": { "node": "out", "port": "image" } }
  ],
  "assets": [],
  "plugins": []
}
```

- `canvas` is the size of generated images (each side at most 16384 px).
- Node, asset and plugin ids use only letters, digits, `_` and `-`.
- `params` may be omitted; missing parameters take the node's default. Colors are `#RRGGBB` or `#RRGGBBAA` strings, vectors are `[x, y]`.
- `position` only affects the editor layout. Space nodes about 240 px apart from left to right.
- `assets` lists files the project reads: `{ "id": "photo", "path": "images/photo.png", "kind": "image" }`. `kind` is `image` (PNG) or `palette` (`.hex`, `.txt`, `.gpl` or `.png`). A node refers to an asset by its id, for example `core.image` with `"params": { "asset": "photo" }`.
- Paths are relative to the `.rxc` file, use `/`, and must stay inside its folder: no absolute paths, `..`, drive letters or URL schemes.

## Linking rules

- A link goes from an output port to an input port. Port types are `image`, `number`, `vector` and `color`, and both ends must have the same type.
- Each input takes at most one link. The graph must not contain cycles.
- Number, integer, color and vector parameters can also be driven by a link: use the parameter name as `to.port`. Value nodes (`core.number`, `core.vector`, `core.color`) output `value` and let several nodes share one setting. A linked parameter ignores the value written in `params`.
- `rexel render` renders the single `core.output` node by default. Use `--node <id>` to render any other node that outputs an image.

## Useful commands

```sh
rexel nodes --json                          # every node type with ports and parameters
rexel schema                                # JSON Schema of .rxc
rexel info project.rxc --json               # nodes, assets and plugins of a project
rexel render project.rxc -o out.png --set blur.radius=8 --force
rexel render project.rxc --node blur -o blur.png --force
rexel pack project.rxc -o project.rxcp      # bundle with the files it references
rexel unpack project.rxcp -o folder
```

`--set node.param=value` parses the value as JSON, so strings need quotes: `--set 'grad.from="#ff0000ff"'`.

## Plugins

Projects can ship ES module plugins listed in `plugins` (`{ "id", "version", "path" }`). Their nodes have the type `plugin.<id>.<name>`. The CLI loads them only with `--allow-plugins`, and they run with full access to the computer, so pass that flag only for projects you trust.

## References

- [references/nodes.md](references/nodes.md): every built-in node with its ports, parameters, ranges and defaults
- [references/project.schema.json](references/project.schema.json): the JSON Schema of `.rxc`

Both files are generated from the node definitions with `pnpm skill`, so they always match the installed version.
