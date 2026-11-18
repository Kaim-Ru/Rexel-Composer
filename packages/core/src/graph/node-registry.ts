import { RexelError } from "../errors.ts";
import { blendNode, maskNode } from "../nodes/composite.ts";
import { grayscaleNode, hsvNode, invertNode, levelsNode, paletteNode } from "../nodes/color.ts";
import { blurNode, ditherNode, edgeNode, pixelateNode, sharpenNode } from "../nodes/filter.ts";
import { gradientNode, noiseNode, shapeNode, solidNode } from "../nodes/generate.ts";
import { imageNode, outputNode } from "../nodes/io.ts";
import { cropNode, flipNode, tileNode, transformNode } from "../nodes/transform.ts";
import { colorNode, numberNode, vectorNode } from "../nodes/value.ts";
import type { NodeDefinition } from "./node-definition.ts";

export const CORE_NODES: readonly NodeDefinition[] = [
  imageNode,
  outputNode,
  solidNode,
  gradientNode,
  noiseNode,
  shapeNode,
  hsvNode,
  levelsNode,
  invertNode,
  grayscaleNode,
  paletteNode,
  blurNode,
  sharpenNode,
  edgeNode,
  pixelateNode,
  ditherNode,
  transformNode,
  flipNode,
  cropNode,
  tileNode,
  blendNode,
  maskNode,
  numberNode,
  vectorNode,
  colorNode,
];

export class NodeRegistry {
  private readonly definitions: ReadonlyMap<string, NodeDefinition>;

  constructor(definitions: readonly NodeDefinition[]) {
    this.definitions = new Map(definitions.map((definition) => [definition.type, definition]));
  }

  get(type: string): NodeDefinition | undefined {
    return this.definitions.get(type);
  }

  require(type: string, node?: string): NodeDefinition {
    const definition = this.definitions.get(type);
    if (definition === undefined) {
      throw new RexelError({
        reason: `Unknown node type "${type}"`,
        ...(node === undefined ? {} : { node }),
      });
    }
    return definition;
  }

  list(): NodeDefinition[] {
    return [...this.definitions.values()];
  }

  with(definitions: readonly NodeDefinition[]): NodeRegistry {
    return new NodeRegistry([...this.definitions.values(), ...definitions]);
  }
}

export function createCoreRegistry(): NodeRegistry {
  return new NodeRegistry(CORE_NODES);
}
