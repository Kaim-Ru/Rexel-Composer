import { RexelError } from "../errors.ts";
import type { Project } from "../project/schema.ts";

export interface ParamOverride {
  readonly node: string;
  readonly param: string;
  readonly value: unknown;
}

export function applyParamOverrides(
  project: Project,
  overrides: readonly ParamOverride[],
): Project {
  for (const override of overrides) {
    if (!project.nodes.some((node) => node.id === override.node)) {
      throw new RexelError({
        node: override.node,
        param: override.param,
        reason: `Cannot override "${override.node}.${override.param}": node "${override.node}" does not exist`,
      });
    }
  }
  return {
    ...project,
    nodes: project.nodes.map((node) => {
      const own = overrides.filter((override) => override.node === node.id);
      if (own.length === 0) return node;
      const params = { ...node.params };
      for (const override of own) params[override.param] = override.value;
      return { ...node, params };
    }),
  };
}
