import {
  linkTypeOf,
  type NodeDefinition,
  type PortType,
  type ProjectNode,
} from "@rexel-composer/core";
import type { Viewport } from "./editor-store.ts";

export const NODE_WIDTH = 176;
export const NODE_HEADER_HEIGHT = 28;
export const NODE_ROW_HEIGHT = 22;
export const NODE_PADDING = 6;
const FRAME_MARGIN = 48;
const MISSING_NODE_ROWS = 1;

export interface PortRow {
  readonly name: string;
  readonly type: PortType;
  readonly direction: "input" | "output";
  readonly param: boolean;
  readonly index: number;
}

export function portRows(definition: NodeDefinition | undefined): PortRow[] {
  if (definition === undefined) return [];
  const outputs = Object.entries(definition.outputs).map(([name, type], index) => ({
    name,
    type,
    direction: "output" as const,
    param: false,
    index,
  }));
  const inputs = Object.entries(definition.inputs).map(([name, type]) => ({
    name,
    type,
    param: false,
  }));
  const params = Object.entries(definition.params).flatMap(([name, spec]) => {
    const type = linkTypeOf(spec);
    return type === undefined ? [] : [{ name, type, param: true }];
  });
  const inputRows = [...inputs, ...params].map((row, index) => ({
    ...row,
    direction: "input" as const,
    index: outputs.length + index,
  }));
  return [...outputs, ...inputRows];
}

export function nodeHeight(definition: NodeDefinition | undefined): number {
  const rows = definition === undefined ? MISSING_NODE_ROWS : portRows(definition).length;
  return NODE_HEADER_HEIGHT + rows * NODE_ROW_HEIGHT + NODE_PADDING * 2;
}

export function portPosition(node: ProjectNode, row: PortRow): { x: number; y: number } {
  return {
    x: node.position.x + (row.direction === "output" ? NODE_WIDTH : 0),
    y:
      node.position.y +
      NODE_HEADER_HEIGHT +
      NODE_PADDING +
      row.index * NODE_ROW_HEIGHT +
      NODE_ROW_HEIGHT / 2,
  };
}

export function frameViewport(
  nodes: readonly { node: ProjectNode; definition: NodeDefinition | undefined }[],
  width: number,
  height: number,
  minZoom: number,
  maxZoom: number,
): Viewport {
  if (nodes.length === 0) return { x: width / 2, y: height / 2, zoom: 1 };
  const left = Math.min(...nodes.map(({ node }) => node.position.x));
  const top = Math.min(...nodes.map(({ node }) => node.position.y));
  const right = Math.max(...nodes.map(({ node }) => node.position.x + NODE_WIDTH));
  const bottom = Math.max(
    ...nodes.map(({ node, definition }) => node.position.y + nodeHeight(definition)),
  );
  const zoom = Math.min(
    Math.max(
      Math.min(
        (width - FRAME_MARGIN * 2) / (right - left),
        (height - FRAME_MARGIN * 2) / (bottom - top),
        1,
      ),
      minZoom,
    ),
    maxZoom,
  );
  return {
    x: width / 2 - ((left + right) / 2) * zoom,
    y: height / 2 - ((top + bottom) / 2) * zoom,
    zoom,
  };
}
