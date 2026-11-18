import { createEmptyProject, PROJECT_EXTENSION, serializeProject } from "@rexel/core";
import { EDITOR_COMMANDS } from "@rexel/viewmodel";
import * as vscode from "vscode";
import packageJson from "../package.json" with { type: "json" };
import { ProjectEditorProvider } from "./project-editor.ts";
import { EDITOR_VIEW_TYPE } from "./protocol.ts";

const NEW_PROJECT_COMMAND = "rexel.newProject";
const DEFAULT_PROJECT_NAME = "Untitled";
const SEPARATOR = "/";

async function newProject() {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const target = await vscode.window.showSaveDialog({
    defaultUri:
      folder === undefined
        ? undefined
        : vscode.Uri.joinPath(folder, `untitled${PROJECT_EXTENSION}`),
    filters: { "RexelComposer project": [PROJECT_EXTENSION.slice(1)] },
    saveLabel: "Create Project",
  });
  if (target === undefined) return;
  const name =
    target.path.split(SEPARATOR).at(-1)?.slice(0, -PROJECT_EXTENSION.length) ??
    DEFAULT_PROJECT_NAME;
  const project = createEmptyProject(name, packageJson.version);
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(serializeProject(project)));
  await vscode.commands.executeCommand("vscode.openWith", target, EDITOR_VIEW_TYPE);
}

export function activate(context: vscode.ExtensionContext) {
  const provider = ProjectEditorProvider.register(context);
  context.subscriptions.push(
    vscode.commands.registerCommand(NEW_PROJECT_COMMAND, newProject),
    ...EDITOR_COMMANDS.filter((command) => command.undoRedo !== true).map((command) =>
      vscode.commands.registerCommand(command.id, () => {
        provider.runCommand(command.id);
      }),
    ),
  );
}
