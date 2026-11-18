import { createProjectRegistry, type Project, type ProjectFileSystem } from "@rexel/core";
import { EditorStore, PreviewController } from "@rexel/viewmodel";
import { BrowserWorkerPool } from "./browser/worker-pool.ts";

export interface EditorSession {
  readonly store: EditorStore;
  readonly preview: PreviewController;
  readonly pool: BrowserWorkerPool;
  dispose: () => void;
}

export async function openEditorSession(
  project: Project,
  fileSystem: ProjectFileSystem,
  allowPlugins: boolean,
): Promise<EditorSession> {
  const pool = new BrowserWorkerPool();
  try {
    const registry = await createProjectRegistry(
      project,
      fileSystem,
      allowPlugins ? pool : undefined,
    );
    const store = new EditorStore(project, registry);
    const preview = new PreviewController(store, {
      fileSystem,
      taskRunner: pool,
      pluginSandbox: pool,
    });
    return {
      store,
      preview,
      pool,
      dispose: () => {
        preview.dispose();
        pool.dispose();
      },
    };
  } catch (error) {
    pool.dispose();
    throw error;
  }
}
