# RexelComposer for VS Code

Open `.rxc` and `.rxcp` files to edit RexelComposer node graphs in a VS Code tab. The editor is the same one the web app uses, and it picks up your color theme.

## Features

- Node canvas with pan, zoom, box selection, links, copy and paste
- Live preview of the selected node, PNG export
- Parameter inspector, project canvas size, assets
- Unsaved-changes marker, Ctrl+S, and Undo / Redo come from VS Code
- `.rxcp` archives open and save in place
- Plugins in a project run only after you allow them, inside a worker with no network access

## Commands

Run **RexelComposer: New Project** from the Command Palette to create an empty `.rxc` file. The editing commands (delete, select all, copy, cut, paste, duplicate, zoom) are also in the Command Palette while a project is open.

## Rendering from the command line

The `rexel-composer` npm package provides the `rexel` CLI, which renders the same projects to PNG:

```sh
npm install -g https://github.com/Kaim-Ru/Rexel-Composer/releases/download/v0.1.0/rexel-composer-0.1.0.tgz
rexel render project.rxc -o out.png
```
