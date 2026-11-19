import {
  targetPortType,
  type NodeRegistry,
  type PortType,
  type Project,
} from "@rexel-composer/core";

export interface PortAddress {
  readonly node: string;
  readonly port: string;
}

export function outputType(
  project: Project,
  registry: NodeRegistry,
  address: PortAddress,
): PortType | undefined {
  const node = project.nodes.find((candidate) => candidate.id === address.node);
  return node === undefined ? undefined : registry.get(node.type)?.outputs[address.port];
}

export function inputType(
  project: Project,
  registry: NodeRegistry,
  address: PortAddress,
): PortType | undefined {
  const node = project.nodes.find((candidate) => candidate.id === address.node);
  const definition = node === undefined ? undefined : registry.get(node.type);
  return definition === undefined ? undefined : targetPortType(definition, address.port);
}

export function isUpstream(project: Project, candidate: string, of: string): boolean {
  const pending = [of];
  const seen = new Set<string>();
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    if (current === candidate) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const link of project.links) if (link.to.node === current) pending.push(link.from.node);
  }
  return false;
}

export function canConnect(
  project: Project,
  registry: NodeRegistry,
  from: PortAddress,
  to: PortAddress,
): boolean {
  if (from.node === to.node) return false;
  const source = outputType(project, registry, from);
  return (
    source !== undefined &&
    source === inputType(project, registry, to) &&
    !isUpstream(project, to.node, from.node)
  );
}
