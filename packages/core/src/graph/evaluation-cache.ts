import { isRasterData, type Values } from "./values.ts";

const DEFAULT_CACHE_BYTES = 268_435_456;
const VALUE_OVERHEAD_BYTES = 64;

function sizeOf(values: Values): number {
  let total = 0;
  for (const value of Object.values(values)) {
    total += isRasterData(value) ? value.data.byteLength : VALUE_OVERHEAD_BYTES;
  }
  return total;
}

export class EvaluationCache {
  private readonly entries = new Map<string, { values: Values; bytes: number }>();
  private bytes = 0;

  constructor(private readonly budget = DEFAULT_CACHE_BYTES) {}

  get(key: string): Values | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.values;
  }

  set(key: string, values: Values) {
    const bytes = sizeOf(values);
    if (bytes > this.budget) return;
    const previous = this.entries.get(key);
    if (previous !== undefined) {
      this.bytes -= previous.bytes;
      this.entries.delete(key);
    }
    this.entries.set(key, { values, bytes });
    this.bytes += bytes;
    for (const [oldest, entry] of this.entries) {
      if (this.bytes <= this.budget) break;
      this.entries.delete(oldest);
      this.bytes -= entry.bytes;
    }
  }

  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}
