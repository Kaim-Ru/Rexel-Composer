import type { ParamSpec, PortType } from "@rexel/plugin-api";
import { z } from "zod";
import { RexelError } from "../errors.ts";
import { isHexColor, parseHexColor } from "./values.ts";

export type ParamSpecs = Readonly<Record<string, ParamSpec>>;

const colorSchema = z
  .string()
  .refine(isHexColor, "must be a #RRGGBB or #RRGGBBAA color")
  .transform(parseHexColor);

const vectorSchema = z.tuple([z.number(), z.number()]);

function bounded(
  schema: z.ZodNumber,
  min: number | undefined,
  max: number | undefined,
): z.ZodNumber {
  const lower = min === undefined ? schema : schema.min(min);
  return max === undefined ? lower : lower.max(max);
}

function paramSchema(spec: ParamSpec): z.ZodType {
  switch (spec.kind) {
    case "number":
      return bounded(z.number(), spec.min, spec.max).default(spec.default);
    case "integer":
      return bounded(z.int(), spec.min, spec.max).default(spec.default);
    case "boolean":
      return z.boolean().default(spec.default);
    case "enum":
      return z.enum(spec.options as [string, ...string[]]).default(spec.default);
    case "color":
      return colorSchema.prefault(spec.default);
    case "vector":
      return vectorSchema.default([...spec.default]);
    case "palette":
      return z
        .array(colorSchema)
        .min(1)
        .prefault([...spec.default]);
    case "asset":
      return spec.optional === true ? z.string().default("") : z.string().min(1);
  }
}

export function paramsSchema(specs: ParamSpecs): z.ZodType<Record<string, unknown>> {
  return z.strictObject(
    Object.fromEntries(Object.entries(specs).map(([name, spec]) => [name, paramSchema(spec)])),
  );
}

export function linkTypeOf(spec: ParamSpec): PortType | undefined {
  switch (spec.kind) {
    case "number":
    case "integer":
      return "number";
    case "color":
      return "color";
    case "vector":
      return "vector";
    default:
      return undefined;
  }
}

export function coerceLinkedValue(spec: ParamSpec, value: unknown): unknown {
  if ((spec.kind === "number" || spec.kind === "integer") && typeof value === "number") {
    const rounded = spec.kind === "integer" ? Math.round(value) : value;
    return Math.min(Math.max(rounded, spec.min ?? -Infinity), spec.max ?? Infinity);
  }
  return value;
}

export function paramIssueError(issues: readonly z.core.$ZodIssue[], node: string): RexelError {
  const [issue] = issues;
  if (issue === undefined) return new RexelError({ node, reason: "Invalid parameters" });
  const [param] = issue.code === "unrecognized_keys" ? issue.keys : issue.path.map(String);
  return new RexelError({
    node,
    reason: param === undefined ? issue.message : `Parameter "${param}": ${issue.message}`,
    ...(param === undefined ? {} : { param }),
  });
}
