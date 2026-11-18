import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { Raster, RexelError, type NodeTask, type PortRasters, type TaskRunner } from "@rexel/core";
import type { TaskRequest, TaskResponse } from "./worker-protocol.ts";

const WORKER_FILE = "worker.js";

interface Job {
  readonly request: TaskRequest;
  resolve(outputs: PortRasters): void;
  reject(error: RexelError): void;
}

export class WorkerTaskRunner implements TaskRunner {
  private readonly workerPath = join(dirname(fileURLToPath(import.meta.url)), WORKER_FILE);
  private readonly workers = new Set<Worker>();
  private readonly idle: Worker[] = [];
  private readonly running = new Map<Worker, Job>();
  private readonly queue: Job[] = [];
  private nextId = 0;

  constructor(private readonly size = availableParallelism()) {}

  run(task: NodeTask): Promise<PortRasters> {
    return new Promise((resolve, reject) => {
      this.queue.push({ request: { id: this.nextId++, task }, resolve, reject });
      this.dispatch();
    });
  }

  async close() {
    await Promise.all([...this.workers].map((worker) => worker.terminate()));
    this.workers.clear();
    this.idle.length = 0;
  }

  private dispatch() {
    for (let job = this.queue.shift(); job !== undefined; job = this.queue.shift()) {
      const worker = this.idle.pop() ?? (this.workers.size < this.size ? this.spawn() : undefined);
      if (worker === undefined) {
        this.queue.unshift(job);
        return;
      }
      this.running.set(worker, job);
      worker.postMessage(job.request);
    }
  }

  private spawn(): Worker {
    const worker = new Worker(this.workerPath);
    worker.on("message", (response: TaskResponse) => {
      const job = this.running.get(worker);
      this.running.delete(worker);
      this.idle.push(worker);
      if (response.ok) {
        job?.resolve(
          Object.fromEntries(
            Object.entries(response.outputs).map(([port, raster]) => [port, Raster.from(raster)]),
          ),
        );
      } else {
        job?.reject(new RexelError(response.error));
      }
      this.dispatch();
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
