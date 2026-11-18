import type { NodeDefinition, PortType, ProjectNode } from "@rexel/core";
import {
  frameViewport,
  MAX_ZOOM,
  MIN_ZOOM,
  NODE_HEADER_HEIGHT,
  NODE_PADDING,
  NODE_ROW_HEIGHT,
  NODE_WIDTH,
  nodeHeight,
  portPosition,
  portRows,
  type EditorState,
  type EditorStore,
  type PortAddress,
  type PortRow,
  type Viewport,
} from "@rexel/viewmodel";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";

export const NODE_DRAG_TYPE = "application/x-rexel-node";

const PORT_SIZE = 10;
const WHEEL_ZOOM_SPEED = 0.0015;
const LINK_CURVE_MIN = 40;
const PAN_BUTTON = 1;
const SECONDARY_BUTTON = 2;
const DASHED_LINK = "4 3";
const LINK_WIDTH = 1.5;
const ACTIVE_LINK_WIDTH = 2;
const SPACE_KEY = " ";

export interface CanvasApi {
  frameAll: () => void;
  zoomBy: (factor: number) => void;
  centerPoint: () => { x: number; y: number };
}

type Gesture =
  | { kind: "pan"; startX: number; startY: number; origin: Viewport }
  | { kind: "move"; gesture: string; lastX: number; lastY: number; ids: ReadonlySet<string> }
  | {
      kind: "link";
      anchor: PortAddress;
      direction: "input" | "output";
      type: PortType;
      x: number;
      y: number;
    }
  | { kind: "marquee"; startX: number; startY: number; x: number; y: number; additive: boolean };

interface Props {
  readonly store: EditorStore;
  readonly state: EditorState;
  readonly errorNode: string | undefined;
  readonly apiRef: Ref<CanvasApi>;
}

const GRID_STEP = 16;
const MIN_GRID_PIXELS = 12;

let gestureCounter = 0;

function gridStep(zoom: number): number {
  let step = GRID_STEP * zoom;
  while (step < MIN_GRID_PIXELS) step *= 2;
  return step;
}

function linkPath(fromX: number, fromY: number, toX: number, toY: number): string {
  const curve = Math.max(LINK_CURVE_MIN, Math.abs(toX - fromX) / 2);
  return `M ${fromX} ${fromY} C ${fromX + curve} ${fromY}, ${toX - curve} ${toY}, ${toX} ${toY}`;
}

function portKey(node: string, direction: string, port: string): string {
  return `${node}\u0000${direction}\u0000${port}`;
}

function zoomAround(viewport: Viewport, factor: number, x: number, y: number): Viewport {
  const zoom = Math.min(Math.max(viewport.zoom * factor, MIN_ZOOM), MAX_ZOOM);
  const scale = zoom / viewport.zoom;
  return { zoom, x: x - (x - viewport.x) * scale, y: y - (y - viewport.y) * scale };
}

function portElementAt(clientX: number, clientY: number): HTMLElement | undefined {
  const element = document.elementFromPoint(clientX, clientY);
  return element instanceof HTMLElement
    ? (element.closest<HTMLElement>("[data-port]") ?? undefined)
    : undefined;
}

export function NodeCanvas({ store, state, errorNode, apiRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gesture, setGesture] = useState<Gesture>();
  const spaceHeld = useRef(false);
  const { project, registry, selection, viewport } = state;

  const nodes = useMemo(
    () => project.nodes.map((node) => ({ node, definition: registry.get(node.type) })),
    [project.nodes, registry],
  );

  const ports = useMemo(() => {
    const positions = new Map<string, { x: number; y: number; row: PortRow }>();
    for (const { node, definition } of nodes) {
      for (const row of portRows(definition)) {
        positions.set(portKey(node.id, row.direction, row.name), {
          ...portPosition(node, row),
          row,
        });
      }
    }
    return positions;
  }, [nodes]);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const left = rect?.left ?? 0;
      const top = rect?.top ?? 0;
      return {
        x: (clientX - left - viewport.x) / viewport.zoom,
        y: (clientY - top - viewport.y) / viewport.zoom,
      };
    },
    [viewport],
  );

  const frameAll = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    store.setViewport(frameViewport(nodes, rect.width, rect.height, MIN_ZOOM, MAX_ZOOM));
  }, [nodes, store]);

  useImperativeHandle(
    apiRef,
    () => ({
      frameAll,
      zoomBy: (factor) => {
        const rect = containerRef.current?.getBoundingClientRect();
        store.setViewport(
          zoomAround(store.state.viewport, factor, (rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2),
        );
      },
      centerPoint: () => {
        const rect = containerRef.current?.getBoundingClientRect();
        const { viewport: current } = store.state;
        return {
          x: ((rect?.width ?? 0) / 2 - current.x) / current.zoom - NODE_WIDTH / 2,
          y: ((rect?.height ?? 0) / 2 - current.y) / current.zoom - NODE_HEADER_HEIGHT,
        };
      },
    }),
    [frameAll, store],
  );

  useEffect(() => {
    if (state.revision === 0) frameAll();
  }, [project, frameAll, state.revision]);

  useEffect(() => {
    const element = containerRef.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED);
      store.setViewport(
        zoomAround(
          store.state.viewport,
          factor,
          event.clientX - rect.left,
          event.clientY - rect.top,
        ),
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
    };
  }, [store]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === SPACE_KEY) spaceHeld.current = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === SPACE_KEY) spaceHeld.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const capture = (event: React.PointerEvent) => {
    containerRef.current?.setPointerCapture(event.pointerId);
    containerRef.current?.focus({ preventScroll: true });
  };

  const onBackgroundPointerDown = (event: React.PointerEvent) => {
    capture(event);
    if (
      event.button === PAN_BUTTON ||
      event.button === SECONDARY_BUTTON ||
      event.altKey ||
      spaceHeld.current
    ) {
      setGesture({ kind: "pan", startX: event.clientX, startY: event.clientY, origin: viewport });
      return;
    }
    const point = toWorld(event.clientX, event.clientY);
    if (!event.shiftKey) store.select([]);
    setGesture({
      kind: "marquee",
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      additive: event.shiftKey,
    });
  };

  const onNodePointerDown = (event: React.PointerEvent, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    capture(event);
    let ids = selection;
    if (event.shiftKey) {
      store.toggleSelected(id);
      ids = store.state.selection;
    } else if (!selection.has(id)) {
      store.select([id]);
      ids = new Set([id]);
    }
    const point = toWorld(event.clientX, event.clientY);
    gestureCounter++;
    setGesture({
      kind: "move",
      gesture: String(gestureCounter),
      lastX: point.x,
      lastY: point.y,
      ids,
    });
  };

  const onPortPointerDown = (event: React.PointerEvent, node: string, row: PortRow) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    capture(event);
    const point = toWorld(event.clientX, event.clientY);
    if (row.direction === "input") {
      const source = store.linkInto({ node, port: row.name });
      if (source !== undefined) {
        store.disconnect({ node, port: row.name });
        setGesture({ kind: "link", anchor: source, direction: "output", type: row.type, ...point });
        return;
      }
    }
    setGesture({
      kind: "link",
      anchor: { node, port: row.name },
      direction: row.direction,
      type: row.type,
      ...point,
    });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (gesture === undefined) return;
    const point = toWorld(event.clientX, event.clientY);
    switch (gesture.kind) {
      case "pan":
        store.setViewport({
          ...gesture.origin,
          x: gesture.origin.x + event.clientX - gesture.startX,
          y: gesture.origin.y + event.clientY - gesture.startY,
        });
        break;
      case "move": {
        const dx = Math.round(point.x - gesture.lastX);
        const dy = Math.round(point.y - gesture.lastY);
        if (dx === 0 && dy === 0) break;
        store.moveNodes(gesture.ids, dx, dy, gesture.gesture);
        setGesture({ ...gesture, lastX: gesture.lastX + dx, lastY: gesture.lastY + dy });
        break;
      }
      case "link":
      case "marquee":
        setGesture({ ...gesture, x: point.x, y: point.y });
        break;
    }
  };

  const finishLink = (
    link: Extract<Gesture, { kind: "link" }>,
    clientX: number,
    clientY: number,
  ) => {
    const element = portElementAt(clientX, clientY);
    const node = element?.dataset.node;
    const port = element?.dataset.port;
    const direction = element?.dataset.direction;
    if (node === undefined || port === undefined || direction === link.direction) return;
    if (link.direction === "output") store.connect(link.anchor, { node, port });
    else store.connect({ node, port }, link.anchor);
  };

  const finishMarquee = (marquee: Extract<Gesture, { kind: "marquee" }>) => {
    const left = Math.min(marquee.startX, marquee.x);
    const right = Math.max(marquee.startX, marquee.x);
    const top = Math.min(marquee.startY, marquee.y);
    const bottom = Math.max(marquee.startY, marquee.y);
    if (right - left < 1 && bottom - top < 1) return;
    const hit = nodes
      .filter(
        ({ node, definition }) =>
          node.position.x < right &&
          node.position.x + NODE_WIDTH > left &&
          node.position.y < bottom &&
          node.position.y + nodeHeight(definition) > top,
      )
      .map(({ node }) => node.id);
    store.select(marquee.additive ? [...store.state.selection, ...hit] : hit);
  };

  const onPointerUp = (event: React.PointerEvent) => {
    if (gesture?.kind === "link") finishLink(gesture, event.clientX, event.clientY);
    if (gesture?.kind === "marquee") finishMarquee(gesture);
    setGesture(undefined);
  };

  const onDrop = (event: React.DragEvent) => {
    const type = event.dataTransfer.getData(NODE_DRAG_TYPE);
    if (type === "") return;
    event.preventDefault();
    const point = toWorld(event.clientX, event.clientY);
    store.addNode(type, { x: point.x - NODE_WIDTH / 2, y: point.y - NODE_HEADER_HEIGHT / 2 });
    containerRef.current?.focus({ preventScroll: true });
  };

  const linkGesture = gesture?.kind === "link" ? gesture : undefined;
  const isValidTarget = (node: string, row: PortRow): boolean => {
    if (linkGesture === undefined || row.direction === linkGesture.direction) return false;
    return linkGesture.direction === "output"
      ? store.canConnect(linkGesture.anchor, { node, port: row.name })
      : store.canConnect({ node, port: row.name }, linkGesture.anchor);
  };

  const pendingStart =
    linkGesture === undefined
      ? undefined
      : ports.get(portKey(linkGesture.anchor.node, linkGesture.direction, linkGesture.anchor.port));
  const marquee = gesture?.kind === "marquee" ? gesture : undefined;

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Node canvas"
      tabIndex={0}
      className="canvas-grid relative size-full touch-none overflow-hidden select-none"
      style={
        {
          "--grid-step": `${gridStep(viewport.zoom)}px`,
          "--grid-x": `${viewport.x}px`,
          "--grid-y": `${viewport.y}px`,
        } as React.CSSProperties
      }
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setGesture(undefined);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(NODE_DRAG_TYPE)) event.preventDefault();
      }}
      onDrop={onDrop}
    >
      <div
        className="absolute inset-s-0 top-0 origin-top-left"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
      >
        <svg
          className="pointer-events-none absolute overflow-visible"
          width="1"
          height="1"
          aria-hidden="true"
        >
          {project.links.map((link) => {
            const from = ports.get(portKey(link.from.node, "output", link.from.port));
            const to = ports.get(portKey(link.to.node, "input", link.to.port));
            if (from === undefined || to === undefined) return null;
            const active = selection.has(link.from.node) || selection.has(link.to.node);
            return (
              <path
                key={`${link.to.node}.${link.to.port}`}
                d={linkPath(from.x, from.y, to.x, to.y)}
                fill="none"
                strokeWidth={active ? ACTIVE_LINK_WIDTH : LINK_WIDTH}
                strokeDasharray={from.row.type === "image" ? undefined : DASHED_LINK}
                className={active ? "stroke-focus" : "stroke-fg/60"}
              />
            );
          })}
          {linkGesture !== undefined && pendingStart !== undefined && (
            <path
              d={
                linkGesture.direction === "output"
                  ? linkPath(pendingStart.x, pendingStart.y, linkGesture.x, linkGesture.y)
                  : linkPath(linkGesture.x, linkGesture.y, pendingStart.x, pendingStart.y)
              }
              fill="none"
              strokeWidth={2}
              className="stroke-focus"
            />
          )}
        </svg>
        {nodes.map(({ node, definition }) => (
          <NodeView
            key={node.id}
            node={node}
            definition={definition}
            selected={selection.has(node.id)}
            error={errorNode === node.id}
            linkActive={linkGesture !== undefined}
            isValidTarget={isValidTarget}
            linkedInputs={project.links}
            onHeaderPointerDown={onNodePointerDown}
            onPortPointerDown={onPortPointerDown}
          />
        ))}
        {marquee !== undefined && (
          <div
            className="pointer-events-none absolute border border-focus bg-focus/10"
            style={{
              left: Math.min(marquee.startX, marquee.x),
              top: Math.min(marquee.startY, marquee.y),
              width: Math.abs(marquee.x - marquee.startX),
              height: Math.abs(marquee.y - marquee.startY),
            }}
          />
        )}
      </div>
    </div>
  );
}

interface NodeViewProps {
  readonly node: ProjectNode;
  readonly definition: NodeDefinition | undefined;
  readonly selected: boolean;
  readonly error: boolean;
  readonly linkActive: boolean;
  readonly linkedInputs: readonly { to: PortAddress }[];
  isValidTarget: (node: string, row: PortRow) => boolean;
  onHeaderPointerDown: (event: React.PointerEvent, id: string) => void;
  onPortPointerDown: (event: React.PointerEvent, node: string, row: PortRow) => void;
}

function NodeView({
  node,
  definition,
  selected,
  error,
  linkActive,
  linkedInputs,
  isValidTarget,
  onHeaderPointerDown,
  onPortPointerDown,
}: NodeViewProps) {
  const rows = portRows(definition);
  const title = definition?.title ?? node.type;
  return (
    <div
      role="group"
      aria-label={`${title} ${node.id}`}
      data-selected={selected}
      data-error={error}
      className="absolute rounded-md border border-widget-border bg-widget text-fg shadow-sm data-[error=true]:border-error data-[selected=true]:outline-2 data-[selected=true]:outline-focus"
      style={{
        left: node.position.x,
        top: node.position.y,
        width: NODE_WIDTH,
        height: nodeHeight(definition),
      }}
    >
      <div
        className="flex cursor-grab items-center gap-1.5 truncate rounded-t-md border-b border-widget-border px-2 font-semibold active:cursor-grabbing"
        style={{ height: NODE_HEADER_HEIGHT }}
        onPointerDown={(event) => {
          onHeaderPointerDown(event, node.id);
        }}
      >
        <span className="truncate">{title}</span>
      </div>
      <div style={{ paddingBlock: NODE_PADDING }}>
        {definition === undefined && (
          <div className="truncate px-2 text-error" style={{ height: NODE_ROW_HEIGHT }}>
            Unknown node type
          </div>
        )}
        {rows.map((row) => {
          const connected =
            row.direction === "input" &&
            linkedInputs.some((link) => link.to.node === node.id && link.to.port === row.name);
          const valid = linkActive && isValidTarget(node.id, row);
          return (
            <div
              key={`${row.direction}:${row.name}`}
              className={`relative flex items-center px-3 ${row.direction === "output" ? "justify-end" : ""}`}
              style={{ height: NODE_ROW_HEIGHT }}
            >
              <span className="truncate">{row.name}</span>
              <span
                data-port={row.name}
                data-node={node.id}
                data-direction={row.direction}
                data-valid={valid}
                data-dim={linkActive && !valid}
                aria-label={`${row.direction} ${row.name}`}
                className={`absolute top-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-fg data-[dim=true]:opacity-30 data-[valid=true]:scale-125 data-[valid=true]:border-focus ${
                  row.type === "image" ? "bg-fg" : "bg-widget"
                } ${connected ? "bg-focus" : ""}`}
                style={{
                  width: PORT_SIZE,
                  height: PORT_SIZE,
                  [row.direction === "output" ? "right" : "left"]: -PORT_SIZE / 2,
                }}
                onPointerDown={(event) => {
                  onPortPointerDown(event, node.id, row);
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
