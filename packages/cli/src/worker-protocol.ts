import type { NodeTask, RasterData, RexelErrorDetail } from "@rexel/core";

export interface TaskRequest {
  readonly id: number;
  readonly task: NodeTask;
}

export type TaskResponse =
  | { readonly id: number; readonly ok: true; readonly outputs: Record<string, RasterData> }
  | { readonly id: number; readonly ok: false; readonly error: RexelErrorDetail };
