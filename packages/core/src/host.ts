import type { ProcessContext } from "@rexel-composer/plugin-api";
import type { PluginManifest } from "./plugins/plugin-manifest.ts";
import type { Values } from "./graph/values.ts";

export interface ProjectFileSystem {
  read: (projectPath: string) => Promise<Uint8Array>;
  write: (projectPath: string, data: Uint8Array) => Promise<void>;
  list: () => Promise<string[]>;
}

export interface NodeTask {
  readonly type: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly params: Readonly<Record<string, unknown>>;
  readonly context: ProcessContext;
}

export interface TaskRunner {
  run: (task: NodeTask) => Promise<Values>;
}

export interface PluginSource {
  readonly id: string;
  readonly version: string;
  readonly path: string;
  readonly code: string;
}

export interface PluginSandbox {
  load: (plugins: readonly PluginSource[]) => Promise<PluginManifest[]>;
  run: (task: NodeTask) => Promise<Values>;
}
