import { z } from "zod";
import { defineInlineNode, requireInput } from "../graph/node-definition.ts";
import { IMAGE_PORT } from "./ports.ts";

export const OUTPUT_NODE_TYPE = "core.output";

export const outputNode = defineInlineNode({
  type: OUTPUT_NODE_TYPE,
  inputs: [IMAGE_PORT],
  outputs: [IMAGE_PORT],
  params: z.strictObject({}),
  evaluate(inputs) {
    return Promise.resolve({ [IMAGE_PORT]: requireInput(inputs, IMAGE_PORT) });
  },
});
