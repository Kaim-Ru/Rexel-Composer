import {
  EDITOR_COMMANDS,
  type CommandContext,
  type EditorStore,
  type PreviewController,
} from "@rexel/viewmodel";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { CommandPalette, type PaletteItem } from "./components/CommandPalette.tsx";
import { IconButton } from "./components/Icon.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { NodeCanvas, type CanvasApi } from "./components/NodeCanvas.tsx";
import { NodeLibrary } from "./components/NodeLibrary.tsx";
import { PreviewPanel } from "./components/PreviewPanel.tsx";
import { isTextInput, matchesKeys, useObservable } from "./hooks.ts";
import type { UiHost } from "./host.ts";

const PALETTE_KEYS = ["Ctrl+Shift+P", "F1"];
const ADD_NODE_PREFIX = "rexel.addNode.";
const CASCADE_OFFSET = 24;
const CASCADE_TOLERANCE = 8;

export interface AppApi {
  runCommand: (id: string) => void;
}

interface Props {
  readonly store: EditorStore;
  readonly preview: PreviewController;
  readonly host: UiHost;
  readonly apiRef?: Ref<AppApi>;
}

export function App({ store, preview, host, apiRef }: Props) {
  const state = useObservable(store);
  const previewState = useObservable(preview);
  const canvasRef = useRef<CanvasApi>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const web = host.kind === "web";

  const context = useMemo<CommandContext>(
    () => ({
      store,
      readClipboard: () => host.readClipboard(),
      writeClipboard: (text) => host.writeClipboard(text),
      frameAll: () => canvasRef.current?.frameAll(),
      zoomBy: (factor) => canvasRef.current?.zoomBy(factor),
    }),
    [store, host],
  );

  const addNode = (type: string) => {
    let point = canvasRef.current?.centerPoint() ?? { x: 0, y: 0 };
    const occupied = (x: number, y: number) =>
      store.state.project.nodes.some(
        ({ position }) =>
          Math.abs(position.x - x) < CASCADE_TOLERANCE &&
          Math.abs(position.y - y) < CASCADE_TOLERANCE,
      );
    while (occupied(Math.round(point.x), Math.round(point.y))) {
      point = { x: point.x + CASCADE_OFFSET, y: point.y + CASCADE_OFFSET };
    }
    store.addNode(type, point);
  };

  const editorItems: PaletteItem[] = EDITOR_COMMANDS.map((command) => ({
    id: command.id,
    title: command.title,
    keys: command.keys,
    run: () => void command.run(context),
  }));
  const hostItems: PaletteItem[] = host.actions.map((action) => ({
    id: action.id,
    title: action.title,
    keys: action.keys,
    run: () => void action.run(),
  }));
  const nodeItems: PaletteItem[] = state.registry.list().map((definition) => ({
    id: `${ADD_NODE_PREFIX}${definition.type}`,
    title: `Add Node: ${definition.title}`,
    run: () => {
      addNode(definition.type);
    },
  }));
  const items = [...hostItems, ...editorItems, ...nodeItems];
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useImperativeHandle(
    apiRef,
    () => ({
      runCommand: (id) => {
        itemsRef.current.find((item) => item.id === id)?.run();
      },
    }),
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (web && (matchesKeys(event, PALETTE_KEYS) || event.key === "F1")) {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (document.querySelector("dialog[open]") !== null) return;
      const action = host.actions.find((candidate) => matchesKeys(event, candidate.keys));
      if (action !== undefined) {
        event.preventDefault();
        void action.run();
        return;
      }
      if (isTextInput(event.target)) return;
      const command = EDITOR_COMMANDS.find(
        (candidate) => (web || candidate.undoRedo !== true) && matchesKeys(event, candidate.keys),
      );
      if (command === undefined) return;
      event.preventDefault();
      void command.run(context);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [context, host, web]);

  return (
    <div className="editor-shell">
      {web && (
        <header
          data-area="toolbar"
          className="scroll-area flex items-center gap-1 overflow-y-hidden [scrollbar-gutter:auto] border-b border-panel-border bg-titlebar px-2 py-1 [grid-area:toolbar]"
        >
          <span className="codicon codicon-symbol-color" aria-hidden="true" />
          <h1 className="m-0 truncate px-1 text-[1em] font-semibold">
            {state.project.meta.name}
            {state.dirty && <span aria-label="Unsaved changes"> ●</span>}
          </h1>
          <span className="flex-1" />
          {host.actions.map((action) => (
            <IconButton
              key={action.id}
              icon={action.icon}
              label={
                action.keys?.[0] === undefined
                  ? action.title
                  : `${action.title} (${action.keys[0]})`
              }
              onClick={() => void action.run()}
            />
          ))}
          <span className="mx-1 h-4 border-s border-panel-border" />
          <IconButton
            icon="discard"
            label="Undo (Ctrl+Z)"
            disabled={!state.canUndo}
            onClick={() => {
              store.userUndo();
            }}
          />
          <IconButton
            icon="redo"
            label="Redo (Ctrl+Shift+Z)"
            disabled={!state.canRedo}
            onClick={() => {
              store.userRedo();
            }}
          />
          <IconButton
            icon="screen-full"
            label="Zoom to Fit (Shift+1)"
            onClick={() => canvasRef.current?.frameAll()}
          />
          <IconButton
            icon="terminal-cmd"
            label="Command Palette (Ctrl+Shift+P)"
            onClick={() => {
              setPaletteOpen(true);
            }}
          />
        </header>
      )}
      <aside
        data-area="sidebar"
        aria-label="Nodes"
        className="border-e border-panel-border bg-sidebar [grid-area:sidebar]"
      >
        <NodeLibrary registry={state.registry} onAdd={addNode} />
      </aside>
      <main className="min-h-0 [grid-area:editor]">
        <NodeCanvas
          store={store}
          state={state}
          errorNode={previewState.error?.node}
          apiRef={canvasRef}
        />
      </main>
      <section
        aria-label="Preview"
        className="min-h-0 border-t border-panel-border bg-panel [grid-area:panel]"
      >
        <PreviewPanel preview={preview} host={host} />
      </section>
      <aside
        data-area="inspector"
        aria-label="Inspector"
        className="min-h-0 border-s border-panel-border bg-sidebar [grid-area:inspector]"
      >
        <Inspector store={store} state={state} host={host} />
      </aside>
      {web && (
        <CommandPalette
          open={paletteOpen}
          items={items}
          onClose={() => {
            setPaletteOpen(false);
          }}
        />
      )}
    </div>
  );
}
