import { defineInlineNode } from "../graph/node-definition.ts";

export const numberNode = defineInlineNode({
  type: "core.number",
  title: "Number",
  category: "value",
  inputs: {},
  outputs: { value: "number" },
  params: { value: { kind: "number", default: 0, step: 0.1 } },
  evaluate: (_inputs, params) => ({ value: params.value }),
});

export const vectorNode = defineInlineNode({
  type: "core.vector",
  title: "Vector",
  category: "value",
  inputs: {},
  outputs: { value: "vector" },
  params: { value: { kind: "vector", default: [0, 0] } },
  evaluate: (_inputs, params) => ({ value: params.value }),
});

export const colorNode = defineInlineNode({
  type: "core.color",
  title: "Color",
  category: "value",
  inputs: {},
  outputs: { value: "color" },
  params: { value: { kind: "color", default: "#ffffffff" } },
  evaluate: (_inputs, params) => ({ value: params.value }),
});
