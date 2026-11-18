export interface HostAction {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly keys?: readonly string[];
  run: () => void | Promise<void>;
}

export type AssetKind = "image" | "palette";

export interface UiHost {
  readonly kind: "web" | "vscode";
  readonly actions: readonly HostAction[];
  pickAsset: (kind: AssetKind) => Promise<string | undefined>;
  exportPng: (data: Uint8Array, fileName: string) => Promise<void>;
  readClipboard: () => Promise<string>;
  writeClipboard: (text: string) => Promise<void>;
}
