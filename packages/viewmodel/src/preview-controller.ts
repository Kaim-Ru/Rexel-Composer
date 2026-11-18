import {
  AssetLoader,
  EvaluationCache,
  extractUpstream,
  GraphEvaluator,
  OUTPUT_NODE_TYPE,
  ProjectGraph,
  RexelError,
  type EvaluationHost,
  type NodeRegistry,
  type PrimaryOutput,
  type Project,
  type RexelErrorDetail,
} from "@rexel/core";
import type { EditorStore } from "./editor-store.ts";
import { Observable } from "./observable.ts";

export interface PreviewState {
  readonly nodeId: string | undefined;
  readonly running: boolean;
  readonly output: PrimaryOutput | undefined;
  readonly error: RexelErrorDetail | undefined;
}

const EMPTY: PreviewState = {
  nodeId: undefined,
  running: false,
  output: undefined,
  error: undefined,
};

export class PreviewController extends Observable<PreviewState> {
  private readonly cache = new EvaluationCache();
  private readonly assets: AssetLoader;
  private readonly unsubscribe: () => void;
  private lastProject: Project | undefined;
  private lastRegistry: NodeRegistry | undefined;
  private lastTarget: string | undefined;
  private running = false;
  private pending = false;
  private disposed = false;

  constructor(
    private readonly store: EditorStore,
    private readonly host: EvaluationHost,
  ) {
    super(EMPTY);
    this.assets = new AssetLoader(host.fileSystem);
    this.unsubscribe = store.subscribe(() => {
      this.request();
    });
    this.request();
  }

  target(): string | undefined {
    const { selection, project } = this.store.state;
    if (selection.size === 1) return [...selection][0];
    return project.nodes.find((node) => node.type === OUTPUT_NODE_TYPE)?.id;
  }

  invalidate() {
    this.assets.clear();
    this.cache.clear();
    this.lastProject = undefined;
    this.request();
  }

  dispose() {
    this.disposed = true;
    this.unsubscribe();
  }

  private request() {
    const { project, registry } = this.store.state;
    const target = this.target();
    if (
      project === this.lastProject &&
      registry === this.lastRegistry &&
      target === this.lastTarget
    )
      return;
    this.lastProject = project;
    this.lastRegistry = registry;
    this.lastTarget = target;
    if (this.running) {
      this.pending = true;
      return;
    }
    void this.run();
  }

  private shouldRerun(): boolean {
    return this.pending && !this.disposed;
  }

  private async run() {
    this.running = true;
    do {
      this.pending = false;
      await this.evaluateOnce();
    } while (this.shouldRerun());
    this.running = false;
    if (!this.disposed) this.update({ ...this.getSnapshot(), running: false });
  }

  private async evaluateOnce() {
    const { project, registry } = this.store.state;
    const target = this.target();
    if (target === undefined) {
      this.update(EMPTY);
      return;
    }
    this.update({ ...this.getSnapshot(), nodeId: target, running: true });
    try {
      const graph = ProjectGraph.build(extractUpstream(project, target), registry);
      const evaluator = new GraphEvaluator(graph, this.host, {
        cache: this.cache,
        assets: this.assets,
      });
      const output = await evaluator.evaluatePrimary(target);
      if (!this.pending) this.update({ nodeId: target, running: true, output, error: undefined });
    } catch (error) {
      if (!this.pending) {
        this.update({
          nodeId: target,
          running: true,
          output: undefined,
          error: RexelError.from(error).detail,
        });
      }
    }
  }
}
