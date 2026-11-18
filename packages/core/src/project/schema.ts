import { z } from "zod";
import { MAX_IMAGE_SIDE } from "../image/raster.ts";

export const CURRENT_FORMAT_VERSION = 1;

export const identifierSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/, "must contain only letters, digits, '_' and '-'");

const portReference = z.strictObject({ node: identifierSchema, port: identifierSchema });

const imageSide = z.int().positive().max(MAX_IMAGE_SIDE);

export const projectSchema = z.strictObject({
  formatVersion: z.literal(CURRENT_FORMAT_VERSION),
  meta: z.strictObject({ name: z.string(), appVersion: z.string() }),
  canvas: z.strictObject({ width: imageSide, height: imageSide }),
  nodes: z.array(
    z.strictObject({
      id: identifierSchema,
      type: z.string().min(1),
      position: z.strictObject({ x: z.number(), y: z.number() }),
      params: z.record(z.string(), z.unknown()).default({}),
    }),
  ),
  links: z.array(z.strictObject({ from: portReference, to: portReference })),
  assets: z.array(
    z.strictObject({ id: identifierSchema, path: z.string(), kind: z.enum(["image", "palette"]) }),
  ),
  plugins: z.array(z.strictObject({ id: identifierSchema, version: z.string(), path: z.string() })),
});

export type Project = z.output<typeof projectSchema>;
export type ProjectNode = Project["nodes"][number];
