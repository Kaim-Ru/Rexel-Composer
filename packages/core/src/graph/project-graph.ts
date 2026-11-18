import type { z } from "zod";
import { RexelError } from "../errors.ts";
import type { Project } from "../project/schema.ts";
import type { NodeDefinition } from "./node-definition.ts";
import type { NodeRegistry } from "./node-registry.ts";

export interface PortReference {
  readonly node: string;
  readonly port: string;
}

export interface GraphNode {
  readonly id: string;
  readonly definition: NodeDefinition;
  readonly params: unknown;
  readonly inputLinks: ReadonlyMap<string, PortReference>;
}

enum VisitState {
  Visiting,
  Done,
}

function paramError(issues: readonly z.core.$ZodIssue[], node: string): RexelError {
  const [issue] = issues;
  if (issue === undefined) return new RexelError({ node, reason: "Invalid parameters" });
  const [param] = issue.code === "unrecognized_keys" ? issue.keys : issue.path.map(String);
  return new RexelError({
    node,
    reason: param === undefined ? issue.message : `Parameter "${param}": ${issue.message}`,
    ...(param === undefined ? {} : { param }),
  });
}

export class ProjectGraph {
  private constructor(private readonly nodes: ReadonlyMap<string, GraphNode>) {}

  static build(project: Project, registry: NodeRegistry): ProjectGraph {
    const links = new Map<string, Map<string, PortReference>>();
    const definitions = new Map<string, NodeDefinition>();
    for (const node of project.nodes) {
      if (definitions.has(node.id)) {
        throw new RexelError({ node: node.id, reason: `Node id "${node.id}" is used twice` });
      }
      definitions.set(node.id, registry.require(node.type, node.id));
      links.set(node.id, new Map());
    }
    for (const { from, to } of project.links) {
      const source = definitions.get(from.node);
      const target = definitions.get(to.node);
      const inputs = links.get(to.node);
      if (source === undefined) {
        throw new RexelError({ reason: `Link starts at unknown node "${from.node}"` });
      }
      if (target === undefined || inputs === undefined) {
        throw new RexelError({ reason: `Link ends at unknown node "${to.node}"` });
      }
      if (!source.outputs.includes(from.port)) {
        throw new RexelError({ node: from.node, reason: `Node has no output port "${from.port}"` });
      }
      if (!target.inputs.includes(to.port)) {
        throw new RexelError({ node: to.node, reason: `Node has no input port "${to.port}"` });
      }
      if (inputs.has(to.port)) {
        throw new RexelError({
          node: to.node,
          reason: `Input "${to.port}" has more than one link`,
        });
      }
      inputs.set(to.port, from);
    }
    const nodes = new Map<string, GraphNode>();
    for (const node of project.nodes) {
      const definition = registry.require(node.type, node.id);
      const params = definition.params.safeParse(node.params);
      if (!params.success) throw paramError(params.error.issues, node.id);
      nodes.set(node.id, {
        id: node.id,
        definition,
        params: params.data,
        inputLinks: links.get(node.id) ?? new Map(),
      });
    }
    const graph = new ProjectGraph(nodes);
    graph.assertAcyclic();
    return graph;
  }

  get(id: string): GraphNode {
    const node = this.nodes.get(id);
    if (node === undefined)
      throw new RexelError({ node: id, reason: `Node "${id}" does not exist` });
    return node;
  }

  idsOfType(type: string): string[] {
    return [...this.nodes.values()]
      .filter((node) => node.definition.type === type)
      .map((node) => node.id);
  }

  upstreamOf(id: string): Set<string> {
    const found = new Set<string>();
    const pending = [id];
    for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
      if (found.has(current)) continue;
      found.add(current);
      for (const link of this.get(current).inputLinks.values()) pending.push(link.node);
    }
    return found;
  }

  private assertAcyclic() {
    const states = new Map<string, VisitState>();
    const visit = (id: string) => {
      const state = states.get(id);
      if (state === VisitState.Done) return;
      if (state === VisitState.Visiting) {
        throw new RexelError({ node: id, reason: "Node is part of a cycle" });
      }
      states.set(id, VisitState.Visiting);
      for (const link of this.get(id).inputLinks.values()) visit(link.node);
      states.set(id, VisitState.Done);
    };
    for (const id of this.nodes.keys()) visit(id);
  }
}
