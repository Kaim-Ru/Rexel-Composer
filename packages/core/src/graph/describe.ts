import type { NodeRegistry } from "./node-registry.ts";

export function describeNodes(registry: NodeRegistry) {
  return registry.list().map((definition) => ({
    type: definition.type,
    title: definition.title,
    category: definition.category,
    inputs: definition.inputs,
    outputs: definition.outputs,
    params: definition.params,
  }));
}
