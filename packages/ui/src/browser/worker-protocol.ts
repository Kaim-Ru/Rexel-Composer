import type { NodeTask, PluginManifest, PluginSource, RexelErrorDetail } from "@rexel/core";

export type WorkerRequest =
  | {
      readonly id: number;
      readonly kind: "task";
      readonly task: NodeTask;
      readonly plugin: boolean;
    }
  | { readonly id: number; readonly kind: "plugins"; readonly sources: readonly PluginSource[] };

export type WorkerResponse =
  | { readonly id: number; readonly ok: true; readonly outputs: Record<string, unknown> }
  | { readonly id: number; readonly ok: true; readonly manifests: PluginManifest[] }
  | { readonly id: number; readonly ok: false; readonly error: RexelErrorDetail };
