export type * from "@rexel/plugin-api";
export { PLUGIN_API_VERSION } from "@rexel/plugin-api";
export { RexelError, type RexelErrorDetail } from "./errors.ts";
export type {
  NodeTask,
  PluginSandbox,
  PluginSource,
  ProjectFileSystem,
  TaskRunner,
} from "./host.ts";
export { AssetLoader } from "./graph/asset-loader.ts";
export { describeNodes } from "./graph/describe.ts";
export { EvaluationCache } from "./graph/evaluation-cache.ts";
export {
  GraphEvaluator,
  type EvaluationHost,
  type EvaluationListener,
  type PrimaryOutput,
} from "./graph/evaluator.ts";
export {
  firstOutput,
  NODE_CATEGORIES,
  type NodeCategory,
  type NodeDefinition,
  type PortTypes,
} from "./graph/node-definition.ts";
export { CORE_NODES, createCoreRegistry, NodeRegistry } from "./graph/node-registry.ts";
export { applyParamOverrides, type ParamOverride } from "./graph/param-override.ts";
export { linkTypeOf, type ParamSpecs } from "./graph/params.ts";
export { extractUpstream, ProjectGraph, targetPortType } from "./graph/project-graph.ts";
export { runNodeTask } from "./graph/run-node-task.ts";
export {
  describeValue,
  formatHexColor,
  isRasterData,
  parseHexColor,
  reviveRecord,
  transferablesOf,
  type Values,
} from "./graph/values.ts";
export { encodePng } from "./image/png-encode.ts";
export { decodePng } from "./image/png-decode.ts";
export { MAX_IMAGE_SIDE, Raster } from "./image/raster.ts";
export { IMAGE_NODE_TYPE, OUTPUT_NODE_TYPE } from "./nodes/io.ts";
export { createProjectRegistry, readPluginSources } from "./plugins/load-plugins.ts";
export { pluginDefinitions, type PluginManifest } from "./plugins/plugin-manifest.ts";
export { PluginRuntime, type LoadedPluginModule } from "./plugins/plugin-runtime.ts";
export {
  ARCHIVE_PROJECT_ENTRY,
  archivedPaths,
  packProject,
  unpackProject,
  type UnpackedProject,
} from "./project/archive.ts";
export { parseProject } from "./project/load.ts";
export { MemoryFileSystem } from "./project/memory-file-system.ts";
export { assertInsideRoot, normalizeProjectPath } from "./project/paths.ts";
export {
  ARCHIVE_EXTENSION,
  createEmptyProject,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
  PROJECT_EXTENSION,
  projectJsonSchema,
  serializeProject,
} from "./project/project-file.ts";
export { CURRENT_FORMAT_VERSION, type Project, type ProjectNode } from "./project/schema.ts";
export { validateProject } from "./project/validate.ts";
