import { parentPort } from "node:worker_threads";
import { createCoreRegistry, RexelError, runNodeTask } from "@rexel/core";
import type { TaskRequest, TaskResponse } from "./worker-protocol.ts";

const port = parentPort;
if (port === null) throw new Error("worker.js must run as a worker thread");

const registry = createCoreRegistry();

port.on("message", (request: TaskRequest) => {
  let response: TaskResponse;
  let transfer: ArrayBuffer[] = [];
  try {
    const outputs = runNodeTask(registry, request.task);
    const plain = Object.fromEntries(
      Object.entries(outputs).map(([name, raster]) => [
        name,
        { width: raster.width, height: raster.height, data: raster.data },
      ]),
    );
    transfer = [...new Set(Object.values(plain).map((raster) => raster.data.buffer))];
    response = { id: request.id, ok: true, outputs: plain };
  } catch (error) {
    response = { id: request.id, ok: false, error: RexelError.from(error).detail };
  }
  port.postMessage(response, transfer);
});
