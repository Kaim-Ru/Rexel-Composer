import type { ParamValues, PortType, PortValues, ProcessContext } from "@rexel/plugin-api";
import type { z } from "zod";
import { RexelError } from "../errors.ts";
import type { Raster } from "../image/raster.ts";
import { paramsSchema, type ParamSpecs } from "./params.ts";
import type { Values } from "./values.ts";

export type PortTypes = Readonly<Record<string, PortType>>;

export type NodeCategory =
  "io" | "generate" | "color" | "filter" | "transform" | "composite" | "value" | "plugin";

export const NODE_CATEGORIES: readonly NodeCategory[] = [
  "io",
  "generate",
  "color",
  "filter",
  "transform",
  "composite",
  "value",
  "plugin",
];

export interface PureExecution {
  readonly kind: "pure";
  process: (
    inputs: Values,
    params: Readonly<Record<string, unknown>>,
    context: ProcessContext,
  ) => Values;
}

export interface InlineExecution {
  readonly kind: "inline";
  evaluate: (inputs: Values, params: Readonly<Record<string, unknown>>) => Values;
}

export interface PluginExecution {
  readonly kind: "plugin";
}

export interface NodeDefinition {
  readonly type: string;
  readonly title: string;
  readonly category: NodeCategory;
  readonly inputs: PortTypes;
  readonly outputs: PortTypes;
  readonly params: ParamSpecs;
  readonly paramsSchema: z.ZodType<Record<string, unknown>>;
  readonly execution: PureExecution | InlineExecution | PluginExecution;
}

type ImageAware<Ports extends PortTypes> = {
  readonly [Name in keyof Ports]: Ports[Name] extends "image" ? Raster : PortValues<Ports>[Name];
};

type ImageAwareParams<Params extends ParamSpecs> = {
  readonly [Name in keyof Params]: ParamValues<Params>[Name] extends infer Value
    ? [Value] extends [{ readonly data: Float32Array }]
      ? Raster
      : [Value] extends [{ readonly data: Float32Array } | undefined]
        ? Raster | undefined
        : Value
    : never;
};

interface NodeSpec<Inputs extends PortTypes, Outputs extends PortTypes, Params extends ParamSpecs> {
  readonly type: string;
  readonly title: string;
  readonly category: NodeCategory;
  readonly inputs: Inputs;
  readonly outputs: Outputs;
  readonly params: Params;
}

export function definePureNode<
  const Inputs extends PortTypes,
  const Outputs extends PortTypes,
  const Params extends ParamSpecs,
>(
  spec: NodeSpec<Inputs, Outputs, Params> & {
    process: (
      inputs: ImageAware<Inputs>,
      params: ImageAwareParams<Params>,
      context: ProcessContext,
    ) => ImageAware<Outputs>;
  },
): NodeDefinition {
  const { process, ...shape } = spec;
  return {
    ...shape,
    paramsSchema: paramsSchema(spec.params),
    execution: {
      kind: "pure",
      process: (inputs, params, context) =>
        process(inputs as ImageAware<Inputs>, params as ImageAwareParams<Params>, context),
    },
  };
}

export function defineInlineNode<
  const Inputs extends PortTypes,
  const Outputs extends PortTypes,
  const Params extends ParamSpecs,
>(
  spec: NodeSpec<Inputs, Outputs, Params> & {
    evaluate: (inputs: ImageAware<Inputs>, params: ImageAwareParams<Params>) => ImageAware<Outputs>;
  },
): NodeDefinition {
  const { evaluate, ...shape } = spec;
  return {
    ...shape,
    paramsSchema: paramsSchema(spec.params),
    execution: {
      kind: "inline",
      evaluate: (inputs, params) =>
        evaluate(inputs as ImageAware<Inputs>, params as ImageAwareParams<Params>),
    },
  };
}

export function definePluginNode(spec: NodeSpec<PortTypes, PortTypes, ParamSpecs>): NodeDefinition {
  return { ...spec, paramsSchema: paramsSchema(spec.params), execution: { kind: "plugin" } };
}

export function firstOutput(definition: NodeDefinition): [string, PortType] {
  const [first] = Object.entries(definition.outputs);
  if (first === undefined) {
    throw new RexelError({ reason: `Node type "${definition.type}" has no outputs` });
  }
  return first;
}
