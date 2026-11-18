import { RexelError } from "../errors.ts";
import type { NodeTask } from "../host.ts";
import type { NodeRegistry } from "./node-registry.ts";
import { reviveRecord, type Values } from "./values.ts";

export function runNodeTask(registry: NodeRegistry, task: NodeTask): Values {
  const { execution } = registry.require(task.type);
  if (execution.kind !== "pure") {
    throw new RexelError({ reason: `Node type "${task.type}" cannot run as a background task` });
  }
  return execution.process(
    reviveRecord(task.inputs) as Values,
    reviveRecord(task.params),
    task.context,
  );
}
