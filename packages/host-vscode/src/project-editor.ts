import { randomBytes } from "node:crypto";
import {
  ARCHIVE_EXTENSION,
  MemoryFileSystem,
  packProject,
  parseProject,
  RexelError,
  unpackProject,
  type Project,
} from "@rexel-composer/core";
import * as vscode from "vscode";
import { ArchiveProjectFiles, FolderProjectFiles, type ProjectFiles } from "./project-files.ts";
import {
  EDITOR_VIEW_TYPE,
  type HostRequest,
  type HostToWebview,
  type WebviewToHost,
} from "./protocol.ts";

const NONCE_BYTES = 16;
const FLUSH_TIMEOUT_MS = 5000;
const decoder = new TextDecoder();
const encoder = new TextEncoder();

const ASSET_FILTERS: Record<string, Record<string, string[]>> = {
  image: { "PNG image": ["png"] },
  palette: { Palette: ["hex", "txt", "gpl", "png"] },
};

const RUN_PLUGINS = "Run Plugins";
const WITHOUT_PLUGINS = "Open Without Plugins";

function parentFolder(uri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(uri, "..");
}

function isArchive(uri: vscode.Uri): boolean {
  return uri.path.toLowerCase().endsWith(ARCHIVE_EXTENSION);
}

function tryParse(text: string): Project | undefined {
  try {
    return parseProject(text);
  } catch {
    return undefined;
  }
}

class ProjectDocument implements vscode.CustomDocument {
  text: string;
  allowPlugins: boolean | undefined;

  private constructor(
    readonly uri: vscode.Uri,
    text: string,
    public files: ProjectFiles,
  ) {
    this.text = text;
  }

  static async open(uri: vscode.Uri, source: vscode.Uri): Promise<ProjectDocument> {
    const bytes = await vscode.workspace.fs.readFile(source);
    if (isArchive(uri)) {
      const { projectText, files } = unpackProject(bytes);
      return new ProjectDocument(
        uri,
        projectText,
        new ArchiveProjectFiles(parentFolder(uri), files),
      );
    }
    return new ProjectDocument(
      uri,
      decoder.decode(bytes),
      new FolderProjectFiles(parentFolder(uri)),
    );
  }

  async reload() {
    const fresh = await ProjectDocument.open(this.uri, this.uri);
    this.text = fresh.text;
    this.files = fresh.files;
  }

  async bytes(): Promise<Uint8Array> {
    if (!(this.files instanceof ArchiveProjectFiles)) return encoder.encode(this.text);
    return packProject(this.text, parseProject(this.text), new MemoryFileSystem(this.files.files));
  }

  dispose() {
    this.text = "";
  }
}

export class ProjectEditorProvider implements vscode.CustomEditorProvider<ProjectDocument> {
  private readonly changes = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<ProjectDocument>
  >();
  readonly onDidChangeCustomDocument = this.changes.event;
  private readonly panels = new Map<ProjectDocument, vscode.WebviewPanel>();
  private readonly flushes = new Map<number, (text: string | undefined) => void>();
  private nextFlushId = 0;
  private active: vscode.WebviewPanel | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  static register(context: vscode.ExtensionContext): ProjectEditorProvider {
    const provider = new ProjectEditorProvider(context);
    context.subscriptions.push(
      vscode.window.registerCustomEditorProvider(EDITOR_VIEW_TYPE, provider, {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }),
    );
    return provider;
  }

  runCommand(id: string) {
    void this.active?.webview.postMessage({ type: "command", id } satisfies HostToWebview);
  }

  async openCustomDocument(
    uri: vscode.Uri,
    context: vscode.CustomDocumentOpenContext,
  ): Promise<ProjectDocument> {
    const source = context.backupId === undefined ? uri : vscode.Uri.parse(context.backupId);
    return ProjectDocument.open(uri, source);
  }

  resolveCustomEditor(document: ProjectDocument, panel: vscode.WebviewPanel) {
    this.panels.set(document, panel);
    const distUri = vscode.Uri.joinPath(this.context.extensionUri, "dist");
    panel.webview.options = { enableScripts: true, localResourceRoots: [distUri] };
    panel.webview.html = this.html(panel.webview, distUri);
    const post = (message: HostToWebview) => void panel.webview.postMessage(message);

    const trackActive = () => {
      if (panel.active) this.active = panel;
      else if (this.active === panel) this.active = undefined;
    };
    trackActive();
    panel.onDidChangeViewState(trackActive);
    panel.onDidDispose(() => {
      this.panels.delete(document);
      if (this.active === panel) this.active = undefined;
    });

    panel.webview.onDidReceiveMessage(async (message: WebviewToHost) => {
      switch (message.type) {
        case "ready":
          post({
            type: "init",
            text: document.text,
            allowPlugins: await this.pluginConsent(document),
          });
          break;
        case "text":
          document.text = message.text;
          break;
        case "flushed":
          this.flushes.get(message.id)?.(message.text);
          this.flushes.delete(message.id);
          break;
        case "edit":
          this.changes.fire({
            document,
            label: message.label,
            undo: () => {
              post({ type: "undo" });
            },
            redo: () => {
              post({ type: "redo" });
            },
          });
          break;
        case "request":
          try {
            post({
              type: "response",
              id: message.id,
              ok: true,
              value: await this.handle(document, message.request),
            });
          } catch (error) {
            post({
              type: "response",
              id: message.id,
              ok: false,
              error: RexelError.from(error).message,
            });
          }
          break;
      }
    });
  }

  private async sync(document: ProjectDocument) {
    const panel = this.panels.get(document);
    if (panel === undefined) return;
    const id = this.nextFlushId++;
    const text = await new Promise<string | undefined>((resolve) => {
      this.flushes.set(id, resolve);
      setTimeout(() => {
        this.flushes.delete(id);
        resolve(undefined);
      }, FLUSH_TIMEOUT_MS);
      void panel.webview.postMessage({ type: "flush", id } satisfies HostToWebview);
    });
    if (text !== undefined) document.text = text;
  }

  async saveCustomDocument(document: ProjectDocument): Promise<void> {
    await this.sync(document);
    await vscode.workspace.fs.writeFile(document.uri, await document.bytes());
  }

  async saveCustomDocumentAs(document: ProjectDocument, destination: vscode.Uri): Promise<void> {
    await this.sync(document);
    await vscode.workspace.fs.writeFile(destination, await document.bytes());
  }

  async revertCustomDocument(document: ProjectDocument): Promise<void> {
    await document.reload();
    void this.panels
      .get(document)
      ?.webview.postMessage({ type: "reset", text: document.text } satisfies HostToWebview);
  }

  async backupCustomDocument(
    document: ProjectDocument,
    context: vscode.CustomDocumentBackupContext,
  ): Promise<vscode.CustomDocumentBackup> {
    await this.sync(document);
    await vscode.workspace.fs.writeFile(context.destination, await document.bytes());
    return {
      id: context.destination.toString(),
      delete: () => {
        void vscode.workspace.fs.delete(context.destination).then(undefined, () => undefined);
      },
    };
  }

  private async pluginConsent(document: ProjectDocument): Promise<boolean> {
    if (document.allowPlugins !== undefined) return document.allowPlugins;
    const plugins = tryParse(document.text)?.plugins ?? [];
    if (plugins.length === 0) return false;
    const choice = await vscode.window.showWarningMessage(
      `${vscode.workspace.asRelativePath(document.uri)} contains plugins. Run them?`,
      {
        modal: true,
        detail: `Plugins run in a webview worker without network access.\n\n${plugins
          .map((plugin) => `${plugin.id} ${plugin.version} (${plugin.path})`)
          .join("\n")}`,
      },
      RUN_PLUGINS,
      WITHOUT_PLUGINS,
    );
    document.allowPlugins = choice === RUN_PLUGINS;
    return document.allowPlugins;
  }

  private async handle(document: ProjectDocument, request: HostRequest): Promise<unknown> {
    switch (request.method) {
      case "read":
        return document.files.read(request.path);
      case "list":
        return document.files.list();
      case "pickAsset": {
        const [picked] =
          (await vscode.window.showOpenDialog({
            canSelectMany: false,
            defaultUri: document.files.folder,
            filters: ASSET_FILTERS[request.kind],
            openLabel: "Add Asset",
          })) ?? [];
        return picked === undefined ? undefined : document.files.importFile(picked);
      }
      case "exportPng": {
        const target = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.joinPath(document.files.folder, request.fileName),
          filters: { "PNG image": ["png"] },
        });
        if (target !== undefined) await vscode.workspace.fs.writeFile(target, request.data);
        return undefined;
      }
      case "readClipboard":
        return vscode.env.clipboard.readText();
      case "writeClipboard":
        await vscode.env.clipboard.writeText(request.text);
        return undefined;
    }
  }

  private html(webview: vscode.Webview, distUri: vscode.Uri): string {
    const nonce = randomBytes(NONCE_BYTES).toString("hex");
    const source = webview.cspSource;
    const script = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "webview", "webview.js"));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "webview", "webview.css"));
    const policy = [
      "default-src 'none'",
      `script-src 'nonce-${nonce}' ${source} blob:`,
      "worker-src blob:",
      `style-src ${source} 'unsafe-inline'`,
      `font-src ${source}`,
      `img-src ${source} blob: data:`,
      `connect-src ${source} data:`,
    ].join("; ");
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${policy}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${style.toString()}" />
    <title>RexelComposer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${script.toString()}"></script>
  </body>
</html>`;
  }
}
