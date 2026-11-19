import {
  ARCHIVE_EXTENSION,
  packProject,
  PROJECT_EXTENSION,
  RexelError,
} from "@rexel-composer/core";
import {
  App,
  Icon,
  ModalDialog,
  openEditorSession,
  type AssetKind,
  type EditorSession,
  type HostAction,
  type UiHost,
} from "@rexel-composer/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { download, filesByRelativePath, pickFiles, readDrop } from "./browser-io.ts";
import { EXAMPLES } from "./examples.ts";
import {
  directoryCandidates,
  isProjectFile,
  loadArchive,
  loadFromDirectory,
  loadFromFiles,
  newProject,
  projectCandidates,
  type LoadedProject,
} from "./web-project.ts";

const PNG_TYPE = "image/png";
const PROJECT_TYPE = "application/json";
const ARCHIVE_TYPE = "application/zip";
const ASSET_FOLDER = "assets";
const ASSET_ACCEPT: Record<AssetKind, string> = {
  image: ".png,image/png",
  palette: ".hex,.txt,.gpl,.png",
};
const SEPARATOR = "/";
const PICKER_ID = "rexel-project";
const ABORT_ERROR = "AbortError";
const WELCOME_ACTIONS = new Set(["rexel.newProject", "rexel.openFolder", "rexel.openFile"]);
const canWriteFolders = typeof window.showDirectoryPicker === "function";
const encoder = new TextEncoder();

interface Open {
  readonly generation: number;
  readonly loaded: LoadedProject;
  readonly session: EditorSession;
}

type Prompt =
  | {
      readonly kind: "choose";
      readonly candidates: readonly string[];
      resolve: (path: string | undefined) => void;
    }
  | {
      readonly kind: "plugins";
      readonly loaded: LoadedProject;
      resolve: (allowed: boolean | undefined) => void;
    }
  | { readonly kind: "discard"; resolve: (discard: boolean) => void }
  | { readonly kind: "error"; readonly message: string };

function uniquePath(name: string, taken: ReadonlySet<string>): string {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, "_");
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const extension = dot > 0 ? safe.slice(dot) : "";
  for (let index = 1; ; index++) {
    const candidate = `${ASSET_FOLDER}${SEPARATOR}${index === 1 ? stem : `${stem}-${index}`}${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === ABORT_ERROR;
}

async function ensureWritable(directory: FileSystemDirectoryHandle): Promise<boolean> {
  const descriptor = { mode: "readwrite" } as const;
  if ((await directory.queryPermission?.(descriptor)) === "granted") return true;
  return (await directory.requestPermission?.(descriptor)) === "granted";
}

export function Shell() {
  const [open, setOpen] = useState<Open>();
  const [prompt, setPrompt] = useState<Prompt>();
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  const ask = <Result,>(build: (resolve: (result: Result) => void) => Prompt) =>
    new Promise<Result>((resolve) => {
      setPrompt(
        build((result) => {
          setPrompt(undefined);
          resolve(result);
        }),
      );
    });

  const report = (error: unknown) => {
    if (!isAbort(error)) setPrompt({ kind: "error", message: RexelError.from(error).message });
  };

  const confirmDiscard = async (): Promise<boolean> =>
    open === undefined ||
    !open.session.store.dirty ||
    ask<boolean>((resolve) => ({ kind: "discard", resolve }));

  const activate = async (load: () => Promise<LoadedProject | undefined>) => {
    if (!(await confirmDiscard())) return;
    setBusy(true);
    try {
      const loaded = await load();
      if (loaded === undefined) return;
      let allowPlugins = false;
      if (loaded.project.plugins.length > 0) {
        const answer = await ask<boolean | undefined>((resolve) => ({
          kind: "plugins",
          loaded,
          resolve,
        }));
        if (answer === undefined) return;
        allowPlugins = answer;
      }
      const session = await openEditorSession(loaded.project, loaded.fileSystem, allowPlugins);
      open?.session.dispose();
      generation.current++;
      setOpen({ generation: generation.current, loaded, session });
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };

  const choose = async (candidates: readonly string[]): Promise<string | undefined> => {
    if (candidates.length === 0) {
      throw new RexelError({
        reason: `No ${PROJECT_EXTENSION} or ${ARCHIVE_EXTENSION} file was found`,
      });
    }
    if (candidates.length === 1) return candidates[0];
    return ask<string | undefined>((resolve) => ({ kind: "choose", candidates, resolve }));
  };

  const openFiles = (files: ReadonlyMap<string, Blob | Uint8Array>) =>
    activate(async () => {
      const path = await choose(projectCandidates(files.keys()));
      return path === undefined ? undefined : loadFromFiles(files, path);
    });

  const openDirectory = (handle: FileSystemDirectoryHandle) =>
    activate(async () => {
      const path = await choose(await directoryCandidates(handle));
      return path === undefined ? undefined : loadFromDirectory(handle, path);
    });

  const openFolder = async () => {
    try {
      if (window.showDirectoryPicker !== undefined) {
        await openDirectory(await window.showDirectoryPicker({ mode: "readwrite", id: PICKER_ID }));
        return;
      }
      const files = await pickFiles({ directory: true });
      if (files.length > 0) await openFiles(filesByRelativePath(files));
    } catch (error) {
      report(error);
    }
  };

  const openFile = async () => {
    const [file] = await pickFiles({ accept: `${PROJECT_EXTENSION},${ARCHIVE_EXTENSION}` });
    if (file === undefined) return;
    await activate(async () =>
      file.name.endsWith(ARCHIVE_EXTENSION)
        ? loadArchive(new Uint8Array(await file.arrayBuffer()), file.name)
        : loadFromFiles(new Map([[file.name, file]]), file.name),
    );
  };

  const saveArchive = async ({ loaded, session }: Open) => {
    const { store } = session;
    const bytes = await packProject(store.serialize(), store.state.project, loaded.fileSystem);
    download(
      bytes,
      `${loaded.fileName.slice(0, -PROJECT_EXTENSION.length)}${ARCHIVE_EXTENSION}`,
      ARCHIVE_TYPE,
    );
    store.markSaved();
  };

  const saveToFolder = async ({ loaded, session }: Open) => {
    if (window.showDirectoryPicker === undefined) return;
    const { store } = session;
    const target = await window.showDirectoryPicker({ mode: "readwrite", id: PICKER_ID });
    const { project } = store.state;
    const files = new Map<string, Uint8Array>();
    for (const { path } of [...project.assets, ...project.plugins])
      files.set(path, await loaded.fileSystem.read(path));
    files.set(loaded.fileName, encoder.encode(store.serialize()));
    await loaded.fileSystem.flush(target, files);
    store.markSaved();
  };

  const save = async (current: Open) => {
    const { loaded, session } = current;
    const { store } = session;
    const { directory } = loaded.fileSystem;
    if (directory !== undefined && (await ensureWritable(directory))) {
      await loaded.fileSystem.flush(
        directory,
        new Map([[loaded.fileName, encoder.encode(store.serialize())]]),
      );
      store.markSaved();
      return;
    }
    if (loaded.fileSystem.pending.size > 0) {
      await (canWriteFolders ? saveToFolder(current) : saveArchive(current));
      return;
    }
    download(store.serialize(), loaded.fileName, PROJECT_TYPE);
    store.markSaved();
  };

  const withOpen = (run: (current: Open) => Promise<void>) => async () => {
    if (open === undefined) return;
    try {
      await run(open);
    } catch (error) {
      report(error);
    }
  };

  const actions: HostAction[] = [
    {
      id: "rexel.newProject",
      title: "New Project",
      icon: "new-file",
      run: () => activate(() => Promise.resolve(newProject())),
    },
    {
      id: "rexel.openFolder",
      title: "Open Folder",
      icon: "folder-opened",
      keys: ["Ctrl+O"],
      run: openFolder,
    },
    { id: "rexel.openFile", title: "Open File", icon: "go-to-file", run: openFile },
    ...(open === undefined
      ? []
      : [
          { id: "rexel.save", title: "Save", icon: "save", keys: ["Ctrl+S"], run: withOpen(save) },
          ...(canWriteFolders
            ? [
                {
                  id: "rexel.saveToFolder",
                  title: "Save to Folder",
                  icon: "save-as",
                  run: withOpen(saveToFolder),
                },
              ]
            : []),
          {
            id: "rexel.saveArchive",
            title: `Download ${ARCHIVE_EXTENSION}`,
            icon: "package",
            keys: ["Ctrl+Shift+S"],
            run: withOpen(saveArchive),
          },
          {
            id: "rexel.closeProject",
            title: "Close Project",
            icon: "close",
            run: async () => {
              if (!(await confirmDiscard())) return;
              open.session.dispose();
              setOpen(undefined);
            },
          },
        ]),
  ];

  const pickAsset = async (kind: AssetKind): Promise<string | undefined> => {
    if (open === undefined) return undefined;
    const [file] = await pickFiles({ accept: ASSET_ACCEPT[kind] });
    if (file === undefined) return undefined;
    const { fileSystem } = open.loaded;
    const path = uniquePath(file.name, new Set(await fileSystem.list()));
    await fileSystem.write(path, new Uint8Array(await file.arrayBuffer()));
    return path;
  };

  const latest = useRef({ actions, pickAsset });
  latest.current = { actions, pickAsset };

  const host = useMemo<UiHost>(
    () => ({
      kind: "web",
      get actions() {
        return latest.current.actions;
      },
      pickAsset: (kind) => latest.current.pickAsset(kind),
      exportPng: (data, fileName) => {
        download(data, fileName, PNG_TYPE);
        return Promise.resolve();
      },
      readClipboard: () => navigator.clipboard.readText(),
      writeClipboard: (text) => navigator.clipboard.writeText(text),
    }),
    [],
  );

  const handlers = useRef({ openDirectory, openFiles, report });
  handlers.current = { openDirectory, openFiles, report };

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (open?.session.store.dirty === true) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [open]);

  useEffect(() => {
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") === true;
    const onDragOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (event.dataTransfer === null || !hasFiles(event)) return;
      event.preventDefault();
      readDrop(event.dataTransfer).then(async (dropped) => {
        if (dropped?.kind === "directory") await handlers.current.openDirectory(dropped.handle);
        else if (dropped !== undefined && [...dropped.files.keys()].some(isProjectFile)) {
          await handlers.current.openFiles(dropped.files);
        }
      }, handlers.current.report);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <>
      {open === undefined ? (
        <Welcome
          busy={busy}
          actions={actions.filter((action) => WELCOME_ACTIONS.has(action.id))}
          onExample={(name) => {
            const example = EXAMPLES.find((candidate) => candidate.name === name);
            if (example === undefined) return;
            void activate(async () => loadFromFiles(await example.load(), example.projectPath));
          }}
        />
      ) : (
        <App
          key={open.generation}
          store={open.session.store}
          preview={open.session.preview}
          host={host}
        />
      )}
      {prompt !== undefined && (
        <PromptDialog
          prompt={prompt}
          onDismiss={() => {
            setPrompt(undefined);
          }}
        />
      )}
    </>
  );
}

function Welcome({
  busy,
  actions,
  onExample,
}: {
  busy: boolean;
  actions: readonly HostAction[];
  onExample: (name: string) => void;
}) {
  const itemClass =
    "flex items-center gap-2 rounded-sm border-0 bg-transparent px-2 py-1 text-start hover:bg-hover";
  return (
    <main
      aria-busy={busy}
      className="grid size-full place-items-center overflow-auto bg-editor p-6"
    >
      <div className="flex w-full max-w-[28rem] flex-col gap-6">
        <h1 className="m-0 flex items-center gap-2 text-[1.6em] font-semibold">
          <Icon name="symbol-color" />
          RexelComposer
        </h1>
        <section aria-label="Start" className="flex flex-col gap-1">
          <h2 className="m-0 mb-1 text-[1em] font-semibold">Start</h2>
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={itemClass}
              onClick={() => void action.run()}
            >
              <Icon name={action.icon} />
              {action.title}
            </button>
          ))}
        </section>
        <section aria-label="Examples" className="flex flex-col gap-1">
          <h2 className="m-0 mb-1 text-[1em] font-semibold">Examples</h2>
          {EXAMPLES.map((example) => (
            <button
              key={example.name}
              type="button"
              className={itemClass}
              onClick={() => {
                onExample(example.name);
              }}
            >
              <Icon name="file" />
              {example.name}
            </button>
          ))}
        </section>
        <p className="m-0">
          Drop a project folder, {PROJECT_EXTENSION} or {ARCHIVE_EXTENSION} here to open it
        </p>
      </div>
    </main>
  );
}

function PromptDialog({ prompt, onDismiss }: { prompt: Prompt; onDismiss: () => void }) {
  switch (prompt.kind) {
    case "error":
      return (
        <ModalDialog
          title="Something went wrong"
          actions={[{ label: "OK", primary: true, run: onDismiss }]}
          onCancel={onDismiss}
        >
          <p className="m-0 text-error">{prompt.message}</p>
        </ModalDialog>
      );
    case "discard":
      return (
        <ModalDialog
          title="Discard unsaved changes?"
          actions={[
            {
              label: "Cancel",
              run: () => {
                prompt.resolve(false);
              },
            },
            {
              label: "Discard",
              primary: true,
              run: () => {
                prompt.resolve(true);
              },
            },
          ]}
          onCancel={() => {
            prompt.resolve(false);
          }}
        >
          <p className="m-0">The current project has changes that are not saved.</p>
        </ModalDialog>
      );
    case "plugins":
      return (
        <ModalDialog
          title="Run plugins from this project?"
          actions={[
            {
              label: "Open without plugins",
              run: () => {
                prompt.resolve(false);
              },
            },
            {
              label: "Run plugins",
              primary: true,
              run: () => {
                prompt.resolve(true);
              },
            },
          ]}
          onCancel={() => {
            prompt.resolve(undefined);
          }}
        >
          <p className="m-0">
            Plugins are code that comes with the project. They run in a worker with no network
            access.
          </p>
          <ul className="m-0 flex flex-col gap-1 ps-5">
            {prompt.loaded.project.plugins.map((plugin) => (
              <li key={plugin.id} className="font-mono">
                {plugin.id} {plugin.version} ({plugin.path})
              </li>
            ))}
          </ul>
        </ModalDialog>
      );
    case "choose":
      return (
        <ModalDialog
          title="Choose a project"
          actions={[
            {
              label: "Cancel",
              run: () => {
                prompt.resolve(undefined);
              },
            },
          ]}
          onCancel={() => {
            prompt.resolve(undefined);
          }}
        >
          <ul className="scroll-area m-0 flex max-h-[50vh] list-none flex-col gap-0.5 p-0">
            {prompt.candidates.map((candidate) => (
              <li key={candidate}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm border-0 bg-transparent px-2 py-1 text-start font-mono hover:bg-hover"
                  onClick={() => {
                    prompt.resolve(candidate);
                  }}
                >
                  <Icon name={candidate.endsWith(ARCHIVE_EXTENSION) ? "package" : "file"} />
                  {candidate}
                </button>
              </li>
            ))}
          </ul>
        </ModalDialog>
      );
  }
}
