import { defineInlineNode } from "../graph/node-definition.ts";

export const OUTPUT_NODE_TYPE = "core.output";
export const IMAGE_NODE_TYPE = "core.image";

export const imageNode = defineInlineNode({
  type: IMAGE_NODE_TYPE,
  title: "Image",
  category: "io",
  inputs: {},
  outputs: { image: "image" },
  params: { asset: { kind: "asset", assetKind: "image" } },
  evaluate: (_inputs, params) => ({ image: params.asset }),
});

export const outputNode = defineInlineNode({
  type: OUTPUT_NODE_TYPE,
  title: "Output",
  category: "io",
  inputs: { image: "image" },
  outputs: { image: "image" },
  params: {},
  evaluate: (inputs) => ({ image: inputs.image }),
});
