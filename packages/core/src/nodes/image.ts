import { z } from "zod";
import { RexelError } from "../errors.ts";
import { defineInlineNode } from "../graph/node-definition.ts";
import { decodePng } from "../image/png-decode.ts";
import { IMAGE_PORT } from "./ports.ts";

const ASSET_PARAM = "asset";

export const imageNode = defineInlineNode({
  type: "core.image",
  inputs: [],
  outputs: [IMAGE_PORT],
  params: z.strictObject({ [ASSET_PARAM]: z.string() }),
  async evaluate(_inputs, params, context) {
    const asset = context.project.assets.find((candidate) => candidate.id === params.asset);
    if (asset === undefined) {
      throw new RexelError({
        param: ASSET_PARAM,
        reason: `Asset "${params.asset}" is not listed in the project's assets`,
      });
    }
    const bytes = await context.fileSystem.read(asset.path);
    try {
      return { [IMAGE_PORT]: decodePng(bytes) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new RexelError({ param: ASSET_PARAM, reason: `${asset.path}: ${reason}` });
    }
  },
});
