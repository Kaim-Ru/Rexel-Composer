import type { Project, ProjectNode } from "@rexel/core";

const CLIPBOARD_MARKER = "rexel-composer/nodes";
const CLIPBOARD_VERSION = 1;

export interface ClipboardContent {
  readonly nodes: readonly ProjectNode[];
  readonly links: Project["links"];
}

export function serializeClipboard(project: Project, ids: ReadonlySet<string>): string | undefined {
  const nodes = project.nodes.filter((node) => ids.has(node.id));
  if (nodes.length === 0) return undefined;
  const links = project.links.filter((link) => ids.has(link.from.node) && ids.has(link.to.node));
  return JSON.stringify({ format: CLIPBOARD_MARKER, version: CLIPBOARD_VERSION, nodes, links });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseClipboard(text: string): ClipboardContent | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (
      !isRecord(value) ||
      value.format !== CLIPBOARD_MARKER ||
      value.version !== CLIPBOARD_VERSION
    )
      return undefined;
    if (!Array.isArray(value.nodes) || !Array.isArray(value.links)) return undefined;
    return { nodes: value.nodes as ProjectNode[], links: value.links as Project["links"] };
  } catch {
    return undefined;
  }
}
