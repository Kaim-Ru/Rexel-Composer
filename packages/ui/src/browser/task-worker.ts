import {
  createCoreRegistry,
  PluginRuntime,
  RexelError,
  runNodeTask,
  transferablesOf,
  type PluginSource,
} from "@rexel/core";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol.ts";

const BLOCKED_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "WebTransport",
  "EventSource",
  "BroadcastChannel",
  "importScripts",
  "indexedDB",
  "caches",
  "Worker",
  "SharedWorker",
  "navigator",
] as const;

const scope = self as unknown as Record<string, unknown> & {
  postMessage: (message: unknown, transfer: Transferable[]) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

for (const name of BLOCKED_GLOBALS) {
  Object.defineProperty(scope, name, { value: undefined, configurable: false, writable: false });
}

const registry = createCoreRegistry();
let plugins: PluginRuntime | undefined;

async function loadPlugins(sources: readonly PluginSource[]): Promise<PluginRuntime> {
  const modules = await Promise.all(
    sources.map(async (source) => {
      const url = URL.createObjectURL(new Blob([source.code], { type: "text/javascript" }));
      try {
        return { id: source.id, module: (await import(url)) as unknown };
      } finally {
        URL.revokeObjectURL(url);
      }
    }),
  );
  return new PluginRuntime(modules);
}

async function handle(
  request: WorkerRequest,
): Promise<{ response: WorkerResponse; transfer: Transferable[] }> {
  if (request.kind === "plugins") {
    plugins = await loadPlugins(request.sources);
    return { response: { id: request.id, ok: true, manifests: plugins.manifests }, transfer: [] };
  }
  if (request.plugin && plugins === undefined)
    throw new RexelError({ reason: "Plugins are not loaded" });
  const outputs =
    request.plugin && plugins !== undefined
      ? plugins.run(request.task)
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

scope.onmessage = (event) => {
  const request = event.data;
  queue = queue
    .then(() => handle(request))
    .then(
      ({ response, transfer }) => {
        scope.postMessage(response, transfer);
      },
      (error: unknown) => {
        scope.postMessage(
          {
            id: request.id,
            ok: false,
            error: RexelError.from(error).detail,
          } satisfies WorkerResponse,
          [],
        );
      },
    );
};
