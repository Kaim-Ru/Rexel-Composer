import { RexelError } from "../errors.ts";
import type { NodeTask } from "../host.ts";
import { Raster } from "../image/raster.ts";
import type { PortRasters } from "./node-definition.ts";
import type { NodeRegistry } from "./node-registry.ts";

export function runNodeTask(registry: NodeRegistry, task: NodeTask): PortRasters {
  const { execution } = registry.require(task.type);
  if (execution.kind !== "pure") {
    throw new RexelError({ reason: `Node type "${task.type}" cannot run as a background task` });
  }
  const inputs = Object.fromEntries(
    Object.entries(task.inputs).map(([port, raster]) => [port, Raster.from(raster)]),
  );
  return execution.process(inputs, task.params);
}
