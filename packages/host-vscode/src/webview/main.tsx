import { parseProject, RexelError, type Project, type ProjectFileSystem } from "@rexel/core";
import { App, openEditorSession, type AppApi, type EditorSession, type UiHost } from "@rexel/ui";
import { createRoot } from "react-dom/client";
import "./webview.css";
import type { HostRequest, HostToWebview, WebviewToHost } from "../protocol.ts";

interface VsCodeApi {
  postMessage: (message: WebviewToHost) => void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
let nextRequestId = 0;

function request<Result>(body: HostRequest): Promise<Result> {
  const id = nextRequestId++;
  return new Promise<Result>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    vscode.postMessage({ type: "request", id, request: body });
  });
}

const fileSystem: ProjectFileSystem = {
  read: (path) => request<Uint8Array>({ method: "read", path }),
  write: () =>
    Promise.reject(
      new RexelError({ reason: "Writing project files from the editor is not supported" }),
    ),
  list: () => request<string[]>({ method: "list" }),
};

const host: UiHost = {
  kind: "vscode",
  actions: [],
  pickAsset: (kind) => request<string | undefined>({ method: "pickAsset", kind }),
  exportPng: (data, fileName) => request<undefined>({ method: "exportPng", data, fileName }),
  readClipboard: () => request<string>({ method: "readClipboard" }),
  writeClipboard: (text) => request<undefined>({ method: "writeClipboard", text }),
};

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("The webview has no #root element");
const root = createRoot(rootElement);
const app: { current: AppApi | null } = { current: null };
let session: EditorSession | undefined;

function showError(error: unknown) {
  root.render(
    <main role="alert" className="grid size-full place-items-center p-6">
      <p className="m-0 max-w-[40rem] text-error">{RexelError.from(error).message}</p>
    </main>,
  );
}

async function start(text: string, allowPlugins: boolean) {
  let project: Project;
  try {
    project = parseProject(text);
    session = await openEditorSession(project, fileSystem, allowPlugins);
  } catch (error) {
    showError(error);
    return;
  }
  const { store, preview } = session;
  let lastProject = store.state.project;
  store.subscribe(() => {
    if (store.state.project === lastProject) return;
    lastProject = store.state.project;
    vscode.postMessage({ type: "text", text: store.serialize() });
  });
  store.setEditListener({
    edited: (label) => {
      vscode.postMessage({ type: "edit", label });
    },
    undone: () => undefined,
    redone: () => undefined,
  });
  root.render(<App store={store} preview={preview} host={host} apiRef={app} />);
}

window.addEventListener("message", (event: MessageEvent<HostToWebview>) => {
  const message = event.data;
  switch (message.type) {
    case "init":
      void start(message.text, message.allowPlugins);
      break;
    case "reset":
      try {
        session?.store.replaceProject(parseProject(message.text));
        session?.preview.invalidate();
      } catch (error) {
        showError(error);
      }
      break;
    case "undo":
      session?.store.undo();
      break;
    case "redo":
      session?.store.redo();
      break;
    case "command":
      app.current?.runCommand(message.id);
      break;
    case "response": {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.ok) waiter?.resolve(message.value);
      else waiter?.reject(new RexelError({ reason: message.error }));
      break;
    }
  }
});

vscode.postMessage({ type: "ready" });
