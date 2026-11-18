import { RexelError } from "../errors.ts";
import { blurNode } from "../nodes/blur.ts";
import { imageNode } from "../nodes/image.ts";
import { outputNode } from "../nodes/output.ts";
import type { NodeDefinition } from "./node-definition.ts";

export class NodeRegistry {
  private readonly definitions: ReadonlyMap<string, NodeDefinition>;

  constructor(definitions: readonly NodeDefinition[]) {
    this.definitions = new Map(definitions.map((definition) => [definition.type, definition]));
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
}

export function createCoreRegistry(): NodeRegistry {
  return new NodeRegistry([imageNode, blurNode, outputNode]);
}
