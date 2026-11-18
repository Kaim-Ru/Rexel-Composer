import { z } from "zod";
import { definePureNode, requireInput } from "../graph/node-definition.ts";
import { gaussianBlur } from "../image/gaussian-blur.ts";
import { IMAGE_PORT } from "./ports.ts";

const DEFAULT_BLUR_RADIUS = 4;
const MAX_BLUR_RADIUS = 256;

export const blurNode = definePureNode({
  type: "core.blur",
  inputs: [IMAGE_PORT],
  outputs: [IMAGE_PORT],
  params: z.strictObject({
    radius: z.number().min(0).max(MAX_BLUR_RADIUS).default(DEFAULT_BLUR_RADIUS),
  }),
  process(inputs, params) {
    return { [IMAGE_PORT]: gaussianBlur(requireInput(inputs, IMAGE_PORT), params.radius) };
  },
});
