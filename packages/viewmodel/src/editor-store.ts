import {
  parseProject,
  serializeProject,
  type NodeRegistry,
  type Project,
  type ProjectNode,
} from "@rexel/core";
import { parseClipboard, serializeClipboard } from "./clipboard.ts";
import { canConnect, type PortAddress } from "./graph-rules.ts";
import { History } from "./history.ts";
import { Observable } from "./observable.ts";

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface EditorState {
  readonly project: Project;
  readonly registry: NodeRegistry;
  readonly selection: ReadonlySet<string>;
  readonly viewport: Viewport;
  readonly revision: number;
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface EditListener {
  edited: (label: string) => void;
  undone: () => void;
  redone: () => void;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;
const PASTE_OFFSET = 32;
const ID_SEPARATOR = "-";
const TYPE_SEPARATOR = ".";
const ID_SANITIZE = /[^A-Za-z0-9_-]/g;

function uniqueId(base: string, taken: ReadonlySet<string>): string {
  const clean = base.replace(ID_SANITIZE, ID_SEPARATOR) || "node";
  if (!taken.has(clean)) return clean;
  for (let index = 2; ; index++) {
    const candidate = `${clean}${ID_SEPARATOR}${index}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function withoutLinksTo(project: Project, to: PortAddress): Project["links"] {
  return project.links.filter((link) => link.to.node !== to.node || link.to.port !== to.port);
}

export class EditorStore extends Observable<EditorState> {
  private readonly history = new History();
  private editListener: EditListener | undefined;
  private savedProject: Project;

  constructor(project: Project, registry: NodeRegistry) {
    super({
      project,
      registry,
      selection: new Set(),
      viewport: { x: 0, y: 0, zoom: 1 },
      revision: 0,
      dirty: false,
      canUndo: false,
      canRedo: false,
    });
    this.savedProject = project;
  }

  get state(): EditorState {
    return this.getSnapshot();
  }

  get project(): Project {
    return this.state.project;
  }

  get dirty(): boolean {
    return this.state.dirty;
  }

  setEditListener(listener: EditListener | undefined) {
    this.editListener = listener;
  }

  serialize(): string {
    return serializeProject(this.project);
  }

  replaceProject(project: Project) {
    this.history.clear();
    this.savedProject = project;
    this.update({
      ...this.state,
      project,
      selection: new Set(),
      revision: 0,
      dirty: false,
      canUndo: false,
      canRedo: false,
    });
  }

  setRegistry(registry: NodeRegistry) {
    this.update({ ...this.state, registry });
  }

  markSaved() {
    this.savedProject = this.project;
    this.update({ ...this.state, dirty: false });
  }

  private commit(next: Project, label: string, mergeKey?: string, selection?: ReadonlySet<string>) {
    const recorded = this.history.record(this.project, label, mergeKey);
    const nodeIds = new Set(next.nodes.map((node) => node.id));
    this.update({
      ...this.state,
      project: next,
      selection: new Set([...(selection ?? this.state.selection)].filter((id) => nodeIds.has(id))),
      revision: this.state.revision + 1,
      dirty: next !== this.savedProject,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    });
    if (recorded) this.editListener?.edited(label);
  }

  private restore(project: Project) {
    const nodeIds = new Set(project.nodes.map((node) => node.id));
    this.update({
      ...this.state,
      project,
      selection: new Set([...this.state.selection].filter((id) => nodeIds.has(id))),
      revision: this.state.revision + 1,
      dirty: project !== this.savedProject,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    });
  }

  undo(): boolean {
    const entry = this.history.undo(this.project);
    if (entry === undefined) return false;
    this.restore(entry.project);
    return true;
  }

  redo(): boolean {
    const entry = this.history.redo(this.project);
    if (entry === undefined) return false;
    this.restore(entry.project);
    return true;
  }

  userUndo() {
    if (this.undo()) this.editListener?.undone();
  }

  userRedo() {
    if (this.redo()) this.editListener?.redone();
  }

  select(ids: Iterable<string>) {
    this.update({ ...this.state, selection: new Set(ids) });
  }

  toggleSelected(id: string) {
    const selection = new Set(this.state.selection);
    if (selection.has(id)) selection.delete(id);
    else selection.add(id);
    this.update({ ...this.state, selection });
  }

  selectAll() {
    this.select(this.project.nodes.map((node) => node.id));
  }

  setViewport(viewport: Viewport) {
    this.update({
      ...this.state,
      viewport: { ...viewport, zoom: Math.min(Math.max(viewport.zoom, MIN_ZOOM), MAX_ZOOM) },
    });
  }

  addNode(type: string, position: Position): string | undefined {
    const definition = this.state.registry.get(type);
    if (definition === undefined) return undefined;
    const taken = new Set(this.project.nodes.map((node) => node.id));
    const id = uniqueId(type.split(TYPE_SEPARATOR).at(-1) ?? type, taken);
    const params = Object.fromEntries(
      Object.entries(definition.params).flatMap(([name, spec]) => {
        if (spec.kind !== "asset") return [[name, spec.default]];
        const asset = this.project.assets.find((candidate) => candidate.kind === spec.assetKind);
        return spec.optional === true ? [] : [[name, asset?.id ?? ""]];
      }),
    );
    const node: ProjectNode = {
      id,
      type,
      position: { x: Math.round(position.x), y: Math.round(position.y) },
      params,
    };
    this.commit(
      { ...this.project, nodes: [...this.project.nodes, node] },
      `Add ${definition.title}`,
      undefined,
      new Set([id]),
    );
    return id;
  }

  removeNodes(ids: ReadonlySet<string>) {
    if (ids.size === 0) return;
    this.commit(
      {
        ...this.project,
        nodes: this.project.nodes.filter((node) => !ids.has(node.id)),
        links: this.project.links.filter(
          (link) => !ids.has(link.from.node) && !ids.has(link.to.node),
        ),
      },
      ids.size === 1 ? "Delete node" : `Delete ${ids.size} nodes`,
    );
  }

  removeSelected() {
    this.removeNodes(this.state.selection);
  }

  moveNodes(ids: ReadonlySet<string>, dx: number, dy: number, gesture: string) {
    if (ids.size === 0 || (dx === 0 && dy === 0)) return;
    this.commit(
      {
        ...this.project,
        nodes: this.project.nodes.map((node) =>
          ids.has(node.id)
            ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }
            : node,
        ),
      },
      "Move nodes",
      `move:${gesture}`,
    );
  }

  canConnect(from: PortAddress, to: PortAddress): boolean {
    return canConnect(this.project, this.state.registry, from, to);
  }

  connect(from: PortAddress, to: PortAddress): boolean {
    if (!this.canConnect(from, to)) return false;
    this.commit(
      {
        ...this.project,
        links: [...withoutLinksTo(this.project, to), { from: { ...from }, to: { ...to } }],
      },
      "Connect",
    );
    return true;
  }

  disconnect(to: PortAddress) {
    const links = withoutLinksTo(this.project, to);
    if (links.length === this.project.links.length) return;
    this.commit({ ...this.project, links }, "Disconnect");
  }

  linkInto(to: PortAddress): PortAddress | undefined {
    return this.project.links.find((link) => link.to.node === to.node && link.to.port === to.port)
      ?.from;
  }

  setParam(nodeId: string, name: string, value: unknown) {
    this.commit(
      {
        ...this.project,
        nodes: this.project.nodes.map((node) =>
          node.id === nodeId ? { ...node, params: { ...node.params, [name]: value } } : node,
        ),
      },
      "Change parameter",
      `param:${nodeId}.${name}`,
    );
  }

  setCanvas(width: number, height: number) {
    this.commit({ ...this.project, canvas: { width, height } }, "Change canvas size", "canvas");
  }

  rename(name: string) {
    this.commit(
      { ...this.project, meta: { ...this.project.meta, name } },
      "Rename project",
      "name",
    );
  }

  addAsset(path: string, kind: "image" | "palette"): string {
    const existing = this.project.assets.find(
      (asset) => asset.path === path && asset.kind === kind,
    );
    if (existing !== undefined) return existing.id;
    const taken = new Set(this.project.assets.map((asset) => asset.id));
    const id = uniqueId(
      path
        .split("/")
        .at(-1)
        ?.replace(/\.[^.]+$/, "") ?? "asset",
      taken,
    );
    this.commit(
      { ...this.project, assets: [...this.project.assets, { id, path, kind }] },
      "Add asset",
    );
    return id;
  }

  removeAsset(id: string) {
    this.commit(
      {
        ...this.project,
        assets: this.project.assets.filter((asset) => asset.id !== id),
        nodes: this.project.nodes.map((node) => ({
          ...node,
          params: Object.fromEntries(
            Object.entries(node.params).map(([name, value]) => [name, value === id ? "" : value]),
          ),
        })),
      },
      "Remove asset",
    );
  }

  copySelection(): string | undefined {
    return serializeClipboard(this.project, this.state.selection);
  }

  paste(text: string): boolean {
    const content = parseClipboard(text);
    if (content === undefined) return false;
    const taken = new Set(this.project.nodes.map((node) => node.id));
    const renamed = new Map<string, string>();
    for (const node of content.nodes) {
      const id = uniqueId(node.id, taken);
      taken.add(id);
      renamed.set(node.id, id);
    }
    const nodes = content.nodes.map((node) => ({
      ...node,
      id: renamed.get(node.id) ?? node.id,
      position: { x: node.position.x + PASTE_OFFSET, y: node.position.y + PASTE_OFFSET },
    }));
    const links = content.links.flatMap((link) => {
      const from = renamed.get(link.from.node);
      const to = renamed.get(link.to.node);
      return from === undefined || to === undefined
        ? []
        : [{ from: { ...link.from, node: from }, to: { ...link.to, node: to } }];
    });
    const next = {
      ...this.project,
      nodes: [...this.project.nodes, ...nodes],
      links: [...this.project.links, ...links],
    };
    try {
      parseProject(serializeProject(next));
    } catch {
      return false;
    }
    this.commit(next, "Paste", undefined, new Set(renamed.values()));
    return true;
  }

  duplicateSelection() {
    const text = this.copySelection();
    if (text !== undefined) this.paste(text);
  }
}
