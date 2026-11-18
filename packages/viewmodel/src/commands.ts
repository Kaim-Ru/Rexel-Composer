import type { EditorStore } from "./editor-store.ts";

export interface CommandContext {
  readonly store: EditorStore;
  readClipboard: () => Promise<string>;
  writeClipboard: (text: string) => Promise<void>;
  frameAll: () => void;
  zoomBy: (factor: number) => void;
}

export interface EditorCommand {
  readonly id: string;
  readonly title: string;
  readonly keys?: readonly string[];
  readonly undoRedo?: boolean;
  run: (context: CommandContext) => void | Promise<void>;
}

const ZOOM_STEP = 1.25;

export const EDITOR_COMMANDS: readonly EditorCommand[] = [
  {
    id: "rexel.undo",
    title: "Undo",
    keys: ["Ctrl+Z"],
    undoRedo: true,
    run: ({ store }) => {
      store.userUndo();
    },
  },
  {
    id: "rexel.redo",
    title: "Redo",
    keys: ["Ctrl+Shift+Z", "Ctrl+Y"],
    undoRedo: true,
    run: ({ store }) => {
      store.userRedo();
    },
  },
  {
    id: "rexel.deleteSelection",
    title: "Delete Selected Nodes",
    keys: ["Delete", "Backspace"],
    run: ({ store }) => {
      store.removeSelected();
    },
  },
  {
    id: "rexel.selectAll",
    title: "Select All Nodes",
    keys: ["Ctrl+A"],
    run: ({ store }) => {
      store.selectAll();
    },
  },
  {
    id: "rexel.copy",
    title: "Copy Selected Nodes",
    keys: ["Ctrl+C"],
    run: async ({ store, writeClipboard }) => {
      const text = store.copySelection();
      if (text !== undefined) await writeClipboard(text);
    },
  },
  {
    id: "rexel.cut",
    title: "Cut Selected Nodes",
    keys: ["Ctrl+X"],
    run: async ({ store, writeClipboard }) => {
      const text = store.copySelection();
      if (text === undefined) return;
      await writeClipboard(text);
      store.removeSelected();
    },
  },
  {
    id: "rexel.paste",
    title: "Paste Nodes",
    keys: ["Ctrl+V"],
    run: async ({ store, readClipboard }) => {
      store.paste(await readClipboard());
    },
  },
  {
    id: "rexel.duplicate",
    title: "Duplicate Selected Nodes",
    keys: ["Ctrl+D"],
    run: ({ store }) => {
      store.duplicateSelection();
    },
  },
  {
    id: "rexel.frameAll",
    title: "Zoom to Fit",
    keys: ["Shift+1"],
    run: ({ frameAll }) => {
      frameAll();
    },
  },
  {
    id: "rexel.zoomIn",
    title: "Zoom In",
    keys: ["Ctrl+="],
    run: ({ zoomBy }) => {
      zoomBy(ZOOM_STEP);
    },
  },
  {
    id: "rexel.zoomOut",
    title: "Zoom Out",
    keys: ["Ctrl+-"],
    run: ({ zoomBy }) => {
      zoomBy(1 / ZOOM_STEP);
    },
  },
];
