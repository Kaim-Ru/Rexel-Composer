import type { z } from "zod";
import { RexelError } from "../errors.ts";
import type { ProjectFileSystem } from "../host.ts";
import type { Raster } from "../image/raster.ts";
import type { Project } from "../project/schema.ts";

export type PortRasters = Readonly<Record<string, Raster>>;

export interface EvaluationContext {
  readonly project: Project;
  readonly fileSystem: ProjectFileSystem;
}

export interface PureExecution {
  readonly kind: "pure";
  process(inputs: PortRasters, params: unknown): PortRasters;
}

export interface InlineExecution {
  readonly kind: "inline";
  evaluate(inputs: PortRasters, params: unknown, context: EvaluationContext): Promise<PortRasters>;
}

export interface NodeDefinition {
  readonly type: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly params: z.ZodType;
  readonly execution: PureExecution | InlineExecution;
}

interface NodeSpec<Params extends z.ZodType> {
  readonly type: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly params: Params;
}

export function definePureNode<Params extends z.ZodType>(
  spec: NodeSpec<Params> & {
    process(inputs: PortRasters, params: z.output<Params>): PortRasters;
  },
): NodeDefinition {
  return {
    type: spec.type,
    inputs: spec.inputs,
    outputs: spec.outputs,
    params: spec.params,
    execution: {
      kind: "pure",
      process: (inputs, params) => spec.process(inputs, spec.params.parse(params)),
    },
  };
}

export function defineInlineNode<Params extends z.ZodType>(
  spec: NodeSpec<Params> & {
    evaluate(
      inputs: PortRasters,
      params: z.output<Params>,
      context: EvaluationContext,
    ): Promise<PortRasters>;
  },
): NodeDefinition {
  return {
    type: spec.type,
    inputs: spec.inputs,
    outputs: spec.outputs,
    params: spec.params,
    execution: {
      kind: "inline",
      evaluate: (inputs, params, context) =>
        spec.evaluate(inputs, spec.params.parse(params), context),
    },
  };
}

export function requireInput(inputs: PortRasters, port: string): Raster {
  const raster = inputs[port];
  if (raster === undefined) throw new RexelError({ reason: `Input "${port}" has no image` });
  return raster;
}
