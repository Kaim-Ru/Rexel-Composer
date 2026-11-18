import type { Project } from "@rexel/core";

const MERGE_WINDOW_MS = 800;
const MAX_HISTORY = 200;

interface Entry {
  readonly project: Project;
  readonly label: string;
}

export class History {
  private past: Entry[] = [];
  private future: Entry[] = [];
  private lastMergeKey: string | undefined;
  private lastEditAt = 0;

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  record(before: Project, label: string, mergeKey: string | undefined): boolean {
    const now = Date.now();
    const merged =
      mergeKey !== undefined &&
      mergeKey === this.lastMergeKey &&
      now - this.lastEditAt < MERGE_WINDOW_MS;
    this.lastMergeKey = mergeKey;
    this.lastEditAt = now;
    this.future = [];
    if (merged) return false;
    this.past.push({ project: before, label });
    if (this.past.length > MAX_HISTORY) this.past.shift();
    return true;
  }

  undo(current: Project): Entry | undefined {
    const entry = this.past.pop();
    if (entry === undefined) return undefined;
    this.future.push({ project: current, label: entry.label });
    this.lastMergeKey = undefined;
    return entry;
  }

  redo(current: Project): Entry | undefined {
    const entry = this.future.pop();
    if (entry === undefined) return undefined;
    this.past.push({ project: current, label: entry.label });
    this.lastMergeKey = undefined;
    return entry;
  }

  clear() {
    this.past = [];
    this.future = [];
    this.lastMergeKey = undefined;
  }
}
