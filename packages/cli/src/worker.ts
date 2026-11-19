import { parentPort } from "node:worker_threads";
import {
  createCoreRegistry,
  PluginRuntime,
  RexelError,
  runNodeTask,
  transferablesOf,
  type PluginSource,
} from "@rexel-composer/core";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol.ts";

const port = parentPort;
if (port === null) throw new Error("worker.js must run as a worker thread");

const registry = createCoreRegistry();
let plugins: PluginRuntime | undefined;

async function loadPlugins(sources: readonly PluginSource[]): Promise<PluginRuntime> {
  const modules = await Promise.all(
    sources.map(async (source) => ({
      id: source.id,
      module: (await import(
        `data:text/javascript;base64,${Buffer.from(source.code).toString("base64")}`
      )) as unknown,
    })),
  );
  return new PluginRuntime(modules);
}

async function handle(
  request: WorkerRequest,
): Promise<{ response: WorkerResponse; transfer: ArrayBuffer[] }> {
  if (request.kind === "plugins") {
    plugins = await loadPlugins(request.sources);
    return { response: { id: request.id, ok: true, manifests: plugins.manifests }, transfer: [] };
  }
  const runtime = plugins;
  if (request.plugin && runtime === undefined)
    throw new RexelError({ reason: "Plugins are not loaded" });
  const outputs =
    request.plugin && runtime !== undefined
      ? runtime.run(request.task)
      : runNodeTask(registry, request.task);
  const plain = Object.fromEntries(
    Object.entries(outputs).map(([name, value]) => [
      name,
      typeof value === "object" && "data" in value
        ? { width: value.width, height: value.height, data: value.data }
        : value,
    ]),
  );
  return {
    response: { id: request.id, ok: true, outputs: plain },
    transfer: transferablesOf(plain),
  };
}

let queue = Promise.resolve();

port.on("message", (request: WorkerRequest) => {
  queue = queue
    .then(() => handle(request))
    .then(
      ({ response, transfer }) => {
        port.postMessage(response, transfer);
      },
      (error: unknown) => {
        port.postMessage({
          id: request.id,
          ok: false,
          error: RexelError.from(error).detail,
        } satisfies WorkerResponse);
      },
    );
});
