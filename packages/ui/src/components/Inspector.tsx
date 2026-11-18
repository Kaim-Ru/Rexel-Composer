import { MAX_IMAGE_SIDE } from "@rexel/core";
import type { EditorState, EditorStore } from "@rexel/viewmodel";
import type { AssetKind, UiHost } from "../host.ts";
import { IconButton } from "./Icon.tsx";
import { ParamControl } from "./ParamControl.tsx";

interface Props {
  readonly store: EditorStore;
  readonly state: EditorState;
  readonly host: UiHost;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2 border-b border-panel-border px-3 py-3"
    >
      <h2 className="m-0 text-[1em] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Inspector({ store, state, host }: Props) {
  const { project, registry, selection } = state;
  const addAsset = async (kind: AssetKind) => {
    const path = await host.pickAsset(kind);
    return path === undefined ? undefined : store.addAsset(path, kind);
  };

  const selected =
    selection.size === 1 ? project.nodes.find((node) => selection.has(node.id)) : undefined;
  if (selected !== undefined) {
    const definition = registry.get(selected.type);
    const params = Object.entries(definition?.params ?? {});
    return (
      <div className="scroll-area size-full">
        <Section title={definition?.title ?? selected.type}>
          <div className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)] gap-2">
            <span>id</span>
            <span className="truncate font-mono">{selected.id}</span>
            <span>type</span>
            <span className="truncate font-mono">{selected.type}</span>
          </div>
        </Section>
        {definition === undefined ? (
          <Section title="Parameters">
            <p className="m-0 text-error">This node type is not available.</p>
          </Section>
        ) : (
          params.length > 0 && (
            <Section title="Parameters">
              {params.map(([name, spec]) => {
                const source = store.linkInto({ node: selected.id, port: name });
                if (source !== undefined) {
                  return (
                    <div
                      key={name}
                      className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)_auto] items-center gap-2"
                    >
                      <span className="truncate">{name}</span>
                      <span className="truncate font-mono">
                        {source.node}.{source.port}
                      </span>
                      <IconButton
                        icon="debug-disconnect"
                        label={`Unlink ${name}`}
                        onClick={() => {
                          store.disconnect({ node: selected.id, port: name });
                        }}
                      />
                    </div>
                  );
                }
                return (
                  <ParamControl
                    key={name}
                    name={name}
                    spec={spec}
                    value={selected.params[name]}
                    assets={project.assets}
                    onChange={(value) => {
                      store.setParam(selected.id, name, value);
                    }}
                    onAddAsset={addAsset}
                  />
                );
              })}
            </Section>
          )
        )}
      </div>
    );
  }

  return (
    <div className="scroll-area size-full">
      <Section title="Project">
        <label className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)] items-center gap-2">
          <span>Name</span>
          <input
            value={project.meta.name}
            onChange={(event) => {
              store.rename(event.target.value);
            }}
          />
        </label>
        {(["width", "height"] as const).map((side) => (
          <label
            key={side}
            className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)] items-center gap-2"
          >
            <span>Canvas {side}</span>
            <input
              type="number"
              min={1}
              max={MAX_IMAGE_SIDE}
              step={1}
              value={project.canvas[side]}
              onChange={(event) => {
                const value = Math.round(Number(event.target.value));
                if (!Number.isFinite(value) || value < 1 || value > MAX_IMAGE_SIDE) return;
                const { width, height } = project.canvas;
                store.setCanvas(
                  side === "width" ? value : width,
                  side === "height" ? value : height,
                );
              }}
            />
          </label>
        ))}
      </Section>
      <Section title="Assets">
        {project.assets.length === 0 && <p className="m-0">No assets</p>}
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {project.assets.map((asset) => (
            <li key={asset.id} className="flex items-center gap-1.5">
              <span
                className={`codicon ${asset.kind === "image" ? "codicon-file-media" : "codicon-symbol-color"}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate" title={asset.path}>
                {asset.path}
              </span>
              <IconButton
                icon="trash"
                label={`Remove ${asset.path}`}
                onClick={() => {
                  store.removeAsset(asset.id);
                }}
              />
            </li>
          ))}
        </ul>
        <div className="flex gap-1">
          <IconButton
            icon="file-media"
            label="Add image asset"
            onClick={() => void addAsset("image")}
          />
          <IconButton
            icon="symbol-color"
            label="Add palette asset"
            onClick={() => void addAsset("palette")}
          />
        </div>
      </Section>
      {project.plugins.length > 0 && (
        <Section title="Plugins">
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {project.plugins.map((plugin) => (
              <li key={plugin.id} className="flex items-center gap-1.5">
                <span className="codicon codicon-extensions" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate" title={plugin.path}>
                  {plugin.id} {plugin.version}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
