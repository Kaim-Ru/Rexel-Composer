import type { PortType } from "@rexel-composer/plugin-api";
import { RexelError } from "../errors.ts";
import type { Project, ProjectNode } from "../project/schema.ts";
import type { NodeDefinition } from "./node-definition.ts";
import type { NodeRegistry } from "./node-registry.ts";
import { linkTypeOf, paramIssueError } from "./params.ts";

export interface PortReference {
  readonly node: string;
  readonly port: string;
}

export interface GraphNode {
  readonly id: string;
  readonly source: ProjectNode;
  readonly definition: NodeDefinition;
  readonly params: Readonly<Record<string, unknown>>;
  readonly inputLinks: ReadonlyMap<string, PortReference>;
  readonly paramLinks: ReadonlyMap<string, PortReference>;
}

enum VisitState {
  Visiting,
  Done,
}

export function targetPortType(definition: NodeDefinition, port: string): PortType | undefined {
  const input = definition.inputs[port];
  if (input !== undefined) return input;
  const param = definition.params[port];
  return param === undefined ? undefined : linkTypeOf(param);
}

function assertAssets(
  project: Project,
  node: ProjectNode,
  definition: NodeDefinition,
  params: Record<string, unknown>,
) {
  for (const [name, spec] of Object.entries(definition.params)) {
    if (spec.kind !== "asset") continue;
    const id = params[name];
    if (id === "" && spec.optional === true) continue;
    const asset = project.assets.find((candidate) => candidate.id === id);
    if (asset === undefined) {
      throw new RexelError({
        node: node.id,
        param: name,
        reason: `Parameter "${name}": asset "${String(id)}" is not listed in the project's assets`,
      });
    }
    if (asset.kind !== spec.assetKind) {
      throw new RexelError({
        node: node.id,
        param: name,
        reason: `Parameter "${name}": asset "${asset.id}" is a ${asset.kind}, but a ${spec.assetKind} is needed`,
      });
    }
  }
}

export class ProjectGraph {
  private constructor(
    readonly project: Project,
    private readonly nodes: ReadonlyMap<string, GraphNode>,
  ) {}

  static build(project: Project, registry: NodeRegistry): ProjectGraph {
    const definitions = new Map<string, NodeDefinition>();
    for (const node of project.nodes) {
      if (definitions.has(node.id)) {
        throw new RexelError({ node: node.id, reason: `Node id "${node.id}" is used twice` });
      }
      definitions.set(node.id, registry.require(node.type, node.id));
    }
    const inputLinks = new Map<string, Map<string, PortReference>>();
    const paramLinks = new Map<string, Map<string, PortReference>>();
    for (const node of project.nodes) {
      inputLinks.set(node.id, new Map());
      paramLinks.set(node.id, new Map());
    }
    for (const { from, to } of project.links) {
      const source = definitions.get(from.node);
      const target = definitions.get(to.node);
      if (source === undefined) {
        throw new RexelError({ reason: `Link starts at unknown node "${from.node}"` });
      }
      if (target === undefined) {
        throw new RexelError({ reason: `Link ends at unknown node "${to.node}"` });
      }
      const sourceType = source.outputs[from.port];
      if (sourceType === undefined) {
        throw new RexelError({ node: from.node, reason: `Node has no output port "${from.port}"` });
      }
      const targetType = targetPortType(target, to.port);
      if (targetType === undefined) {
        throw new RexelError({
          node: to.node,
          reason: `Node has no input port or linkable parameter "${to.port}"`,
        });
      }
      if (targetType !== sourceType) {
        throw new RexelError({
          node: to.node,
          reason: `Cannot link a ${sourceType} output to the ${targetType} port "${to.port}"`,
        });
      }
      const links = (to.port in target.inputs ? inputLinks : paramLinks).get(to.node);
      if (links?.has(to.port) === true) {
        throw new RexelError({ node: to.node, reason: `Port "${to.port}" has more than one link` });
      }
      links?.set(to.port, from);
    }
    const nodes = new Map<string, GraphNode>();
    for (const node of project.nodes) {
      const definition = registry.require(node.type, node.id);
      const parsed = definition.paramsSchema.safeParse(node.params);
      if (!parsed.success) throw paramIssueError(parsed.error.issues, node.id);
      assertAssets(project, node, definition, parsed.data);
      nodes.set(node.id, {
        id: node.id,
        source: node,
        definition,
        params: parsed.data,
        inputLinks: inputLinks.get(node.id) ?? new Map(),
        paramLinks: paramLinks.get(node.id) ?? new Map(),
      });
    }
    const graph = new ProjectGraph(project, nodes);
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
      const node = this.get(current);
      for (const link of [...node.inputLinks.values(), ...node.paramLinks.values()])
        pending.push(link.node);
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
      const node = this.get(id);
      for (const link of [...node.inputLinks.values(), ...node.paramLinks.values()])
        visit(link.node);
      states.set(id, VisitState.Done);
    };
    for (const id of this.nodes.keys()) visit(id);
  }
}

export function extractUpstream(project: Project, id: string): Project {
  const keep = new Set<string>();
  const pending = [id];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    if (keep.has(current)) continue;
    keep.add(current);
    for (const link of project.links) if (link.to.node === current) pending.push(link.from.node);
  }
  return {
    ...project,
    nodes: project.nodes.filter((node) => keep.has(node.id)),
    links: project.links.filter((link) => keep.has(link.to.node) && keep.has(link.from.node)),
  };
}
