import { z } from "zod";
import { definePluginNode, type NodeDefinition } from "../graph/node-definition.ts";
import { isHexColor } from "../graph/values.ts";

const PLUGIN_NODE_PREFIX = "plugin";

const nameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/, "must contain only letters, digits, '_' and '-'");
const portTypeSchema = z.enum(["image", "number", "vector", "color"]);
const hexSchema = z.string().refine(isHexColor, "must be a #RRGGBB or #RRGGBBAA color");
const optionalNumber = z.number().optional();

export const paramSpecSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("number"),
    default: z.number(),
    min: optionalNumber,
    max: optionalNumber,
    step: optionalNumber,
  }),
  z.strictObject({
    kind: z.literal("integer"),
    default: z.int(),
    min: optionalNumber,
    max: optionalNumber,
  }),
  z.strictObject({ kind: z.literal("boolean"), default: z.boolean() }),
  z
    .strictObject({
      kind: z.literal("enum"),
      default: z.string(),
      options: z.array(z.string()).min(1),
    })
    .refine((spec) => spec.options.includes(spec.default), "default must be one of the options"),
  z.strictObject({ kind: z.literal("color"), default: hexSchema }),
  z.strictObject({ kind: z.literal("vector"), default: z.tuple([z.number(), z.number()]) }),
  z.strictObject({ kind: z.literal("palette"), default: z.array(hexSchema).min(1) }),
  z.strictObject({
    kind: z.literal("asset"),
    assetKind: z.enum(["image", "palette"]),
    optional: z.boolean().optional(),
  }),
]);

export const pluginNodeManifestSchema = z.object({
  name: nameSchema,
  title: z.string().min(1),
  inputs: z.record(nameSchema, portTypeSchema),
  outputs: z
    .record(nameSchema, portTypeSchema)
    .refine((outputs) => Object.keys(outputs).length > 0, "needs at least one output"),
  params: z.record(nameSchema, paramSpecSchema),
});

export const pluginManifestSchema = z.object({
  id: nameSchema,
  nodes: z.array(pluginNodeManifestSchema),
});

export type PluginManifest = z.output<typeof pluginManifestSchema>;

export function pluginNodeType(pluginId: string, nodeName: string): string {
  return `${PLUGIN_NODE_PREFIX}.${pluginId}.${nodeName}`;
}

export function pluginDefinitions(manifests: readonly PluginManifest[]): NodeDefinition[] {
  return manifests.flatMap((manifest) =>
    manifest.nodes.map((node) =>
      definePluginNode({
        type: pluginNodeType(manifest.id, node.name),
        title: node.title,
        category: "plugin",
        inputs: node.inputs,
        outputs: node.outputs,
        params: node.params,
      }),
    ),
  );
}
