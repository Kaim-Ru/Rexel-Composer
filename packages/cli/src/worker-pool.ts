import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import {
  reviveRecord,
  RexelError,
  type NodeTask,
  type PluginManifest,
  type PluginSandbox,
  type PluginSource,
  type TaskRunner,
  type Values,
} from "@rexel/core";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol.ts";

const WORKER_FILE = "worker.js";

type Request = WorkerRequest extends infer Item
  ? Item extends unknown
    ? Omit<Item, "id">
    : never
  : never;

interface Job {
  readonly request: Request;
  resolve: (response: WorkerResponse & { ok: true }) => void;
  reject: (error: RexelError) => void;
}

export class WorkerPool implements TaskRunner, PluginSandbox {
  private readonly workerPath = join(dirname(fileURLToPath(import.meta.url)), WORKER_FILE);
  private readonly workers = new Set<Worker>();
  private readonly idle: Worker[] = [];
  private readonly running = new Map<Worker, Job & { id: number }>();
  private readonly queue: Job[] = [];
  private plugins: readonly PluginSource[] = [];
  private nextId = 0;

  constructor(private readonly size = availableParallelism()) {}

  async run(task: NodeTask): Promise<Values> {
    const plugin = task.type.startsWith("plugin.");
    const response = await this.submit({ kind: "task", task, plugin });
    if (!("outputs" in response))
      throw new RexelError({ reason: "The worker returned no outputs" });
    return reviveRecord(response.outputs) as Values;
  }

  async load(plugins: readonly PluginSource[]): Promise<PluginManifest[]> {
    this.plugins = plugins;
    const loads = await Promise.all(
      [...this.workers].map((worker) => this.direct(worker, { kind: "plugins", sources: plugins })),
    );
    const first = loads[0] ?? (await this.submit({ kind: "plugins", sources: plugins }));
    if (!("manifests" in first))
      throw new RexelError({ reason: "The worker returned no plugin manifests" });
    return first.manifests;
  }

  async close() {
    await Promise.all([...this.workers].map((worker) => worker.terminate()));
    this.workers.clear();
    this.idle.length = 0;
  }

  private submit(request: Request): Promise<WorkerResponse & { ok: true }> {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      this.dispatch();
    });
  }

  private direct(worker: Worker, request: Request): Promise<WorkerResponse & { ok: true }> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const listener = (response: WorkerResponse) => {
        if (response.id !== id) return;
        worker.off("message", listener);
        if (response.ok) resolve(response);
        else reject(new RexelError(response.error));
      };
      worker.on("message", listener);
      worker.postMessage({ ...request, id });
    });
  }

  private dispatch() {
    for (let job = this.queue.shift(); job !== undefined; job = this.queue.shift()) {
      const worker = this.idle.pop() ?? (this.workers.size < this.size ? this.spawn() : undefined);
      if (worker === undefined) {
        this.queue.unshift(job);
        return;
      }
      const id = this.nextId++;
      this.running.set(worker, { ...job, id });
      worker.postMessage({ ...job.request, id });
    }
  }

  private finish(worker: Worker) {
    this.running.delete(worker);
    this.idle.push(worker);
    this.dispatch();
  }

  private spawn(): Worker {
    const worker = new Worker(this.workerPath);
    if (this.plugins.length > 0)
      worker.postMessage({ id: this.nextId++, kind: "plugins", sources: this.plugins });
    worker.on("message", (response: WorkerResponse) => {
      const job = this.running.get(worker);
      if (job?.id !== response.id) return;
      if (response.ok) job.resolve(response);
      else job.reject(new RexelError(response.error));
      this.finish(worker);
    });
    worker.on("error", (error) => {
      const job = this.running.get(worker);
      this.running.delete(worker);
      this.workers.delete(worker);
      job?.reject(RexelError.from(error));
      this.dispatch();
    });
    this.workers.add(worker);
    return worker;
  }
}
