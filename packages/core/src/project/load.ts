import type { z } from "zod";
import { RexelError } from "../errors.ts";
import { normalizeProjectPath } from "./paths.ts";
import { CURRENT_FORMAT_VERSION, projectSchema, type Project } from "./schema.ts";

const NODES_KEY = "nodes";
const PARAMS_KEY = "params";
const NODE_INDEX_POSITION = 1;
const NODE_FIELD_POSITION = 2;
const PARAM_NAME_POSITION = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new RexelError({ reason: `Project is not valid JSON: ${message}` });
  }
}

function assertSupportedVersion(json: unknown) {
  if (!isRecord(json)) return;
  const version = json.formatVersion;
  if (typeof version === "number" && version > CURRENT_FORMAT_VERSION) {
    throw new RexelError({
      reason: `Project format version ${version} is newer than the supported version ${CURRENT_FORMAT_VERSION}. Update rexel.`,
    });
  }
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  return path
    .map((key, index) =>
      typeof key === "number" ? `[${key}]` : `${index === 0 ? "" : "."}${String(key)}`,
    )
    .join("");
}

function nodeIdAt(json: unknown, index: PropertyKey | undefined): string | undefined {
  if (!isRecord(json) || typeof index !== "number") return undefined;
  const nodes = json[NODES_KEY];
  if (!Array.isArray(nodes)) return undefined;
  const node: unknown = nodes[index];
  return isRecord(node) && typeof node.id === "string" ? node.id : undefined;
}

function schemaError(json: unknown, issue: z.core.$ZodIssue): RexelError {
  const { path } = issue;
  const node = path[0] === NODES_KEY ? nodeIdAt(json, path[NODE_INDEX_POSITION]) : undefined;
  const param = path[NODE_FIELD_POSITION] === PARAMS_KEY ? path[PARAM_NAME_POSITION] : undefined;
  return new RexelError({
    reason: `${formatIssuePath(path) || "project"}: ${issue.message}`,
    ...(node === undefined ? {} : { node }),
    ...(typeof param === "string" ? { param } : {}),
  });
}

export function parseProject(text: string): Project {
  const json = parseJson(text);
  assertSupportedVersion(json);
  const result = projectSchema.safeParse(json);
  if (!result.success) {
    const [issue] = result.error.issues;
    throw issue === undefined
      ? new RexelError({ reason: "Project is invalid" })
      : schemaError(json, issue);
  }
  const project = result.data;
  return {
    ...project,
    assets: project.assets.map((asset, index) => ({
      ...asset,
      path: normalizeAt(`assets[${index}].path`, asset.path),
    })),
    plugins: project.plugins.map((plugin, index) => ({
      ...plugin,
      path: normalizeAt(`plugins[${index}].path`, plugin.path),
    })),
  };
}

function normalizeAt(location: string, path: string): string {
  try {
    return normalizeProjectPath(path);
  } catch (error) {
    throw new RexelError({ reason: `${location}: ${RexelError.from(error).message}` });
  }
}
