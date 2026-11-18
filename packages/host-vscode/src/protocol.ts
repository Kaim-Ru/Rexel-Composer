import type { AssetKind } from "@rexel/ui";

export const EDITOR_VIEW_TYPE = "rexelComposer.projectEditor";

export type HostRequest =
  | { readonly method: "read"; readonly path: string }
  | { readonly method: "list" }
  | { readonly method: "pickAsset"; readonly kind: AssetKind }
  | { readonly method: "exportPng"; readonly data: Uint8Array; readonly fileName: string }
  | { readonly method: "readClipboard" }
  | { readonly method: "writeClipboard"; readonly text: string };

export type HostToWebview =
  | { readonly type: "init"; readonly text: string; readonly allowPlugins: boolean }
  | { readonly type: "reset"; readonly text: string }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "command"; readonly id: string }
  | { readonly type: "flush"; readonly id: number }
  | { readonly type: "response"; readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly type: "response"; readonly id: number; readonly ok: false; readonly error: string };

export type WebviewToHost =
  | { readonly type: "ready" }
  | { readonly type: "edit"; readonly label: string }
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "flushed"; readonly id: number; readonly text: string | undefined }
  | { readonly type: "request"; readonly id: number; readonly request: HostRequest };
