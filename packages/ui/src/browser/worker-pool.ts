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
import TaskWorker from "./task-worker.ts?worker&inline";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol.ts";

const FALLBACK_PARALLELISM = 4;
const PLUGIN_TYPE_PREFIX = "plugin.";

type Request = WorkerRequest extends infer Item
  ? Item extends unknown
    ? Omit<Item, "id">
    : never
  : never;
type Success = WorkerResponse & { ok: true };

interface Job {
  readonly request: Request;
  resolve: (response: Success) => void;
  reject: (error: RexelError) => void;
}

export class BrowserWorkerPool implements TaskRunner, PluginSandbox {
  private readonly workers = new Set<Worker>();
  private readonly idle: Worker[] = [];
  private readonly running = new Map<Worker, Job & { id: number }>();
  private readonly queue: Job[] = [];
  private plugins: readonly PluginSource[] = [];
  private nextId = 0;

  constructor(private readonly size = navigator.hardwareConcurrency || FALLBACK_PARALLELISM) {}

  async run(task: NodeTask): Promise<Values> {
    const response = await this.submit({
      kind: "task",
      task,
      plugin: task.type.startsWith(PLUGIN_TYPE_PREFIX),
    });
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

  dispose() {
    for (const worker of this.workers) worker.terminate();
    for (const job of this.running.values())
      job.reject(new RexelError({ reason: "The project was closed" }));
    this.workers.clear();
    this.running.clear();
    this.idle.length = 0;
    this.queue.length = 0;
  }

  private submit(request: Request): Promise<Success> {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      this.dispatch();
    });
  }

  private direct(worker: Worker, request: Request): Promise<Success> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const listener = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.id !== id) return;
        worker.removeEventListener("message", listener);
        if (event.data.ok) resolve(event.data);
        else reject(new RexelError(event.data.error));
      };
      worker.addEventListener("message", listener);
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

  private spawn(): Worker {
    const worker = new TaskWorker();
    if (this.plugins.length > 0)
      worker.postMessage({ id: this.nextId++, kind: "plugins", sources: this.plugins });
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const job = this.running.get(worker);
      if (job?.id !== event.data.id) return;
      if (event.data.ok) job.resolve(event.data);
      else job.reject(new RexelError(event.data.error));
      this.running.delete(worker);
      this.idle.push(worker);
      this.dispatch();
    });
    worker.addEventListener("error", (event) => {
      const job = this.running.get(worker);
      this.running.delete(worker);
      this.workers.delete(worker);
      worker.terminate();
      job?.reject(new RexelError({ reason: event.message || "A worker crashed" }));
      this.dispatch();
    });
    this.workers.add(worker);
    return worker;
  }
}
