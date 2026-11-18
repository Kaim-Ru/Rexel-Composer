import { z } from "zod";
import { CURRENT_FORMAT_VERSION, projectSchema, type Project } from "./schema.ts";

const JSON_INDENT = 2;
export const DEFAULT_CANVAS_WIDTH = 128;
export const DEFAULT_CANVAS_HEIGHT = 128;
export const PROJECT_EXTENSION = ".rxc";
export const ARCHIVE_EXTENSION = ".rxcp";

export function serializeProject(project: Project): string {
  return `${JSON.stringify(project, null, JSON_INDENT)}\n`;
}

export function createEmptyProject(name: string, appVersion: string): Project {
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    meta: { name, appVersion },
    canvas: { width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT },
    nodes: [],
    links: [],
    assets: [],
    plugins: [],
  };
}

export function projectJsonSchema(): unknown {
  return z.toJSONSchema(projectSchema, { io: "input" });
}
