import { NODE_CATEGORIES, type NodeCategory, type NodeDefinition } from "@rexel-composer/core";
import type { NodeRegistry } from "@rexel-composer/core";
import { useState } from "react";
import { NODE_DRAG_TYPE } from "./NodeCanvas.tsx";

const CATEGORY_TITLES: Record<NodeCategory, string> = {
  io: "Input / Output",
  generate: "Generate",
  color: "Color",
  filter: "Filter",
  transform: "Transform",
  composite: "Composite",
  value: "Value",
  plugin: "Plugins",
};

export function matchesQuery(definition: NodeDefinition, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return (
    needle === "" ||
    definition.title.toLowerCase().includes(needle) ||
    definition.type.toLowerCase().includes(needle)
  );
}

export function NodeLibrary({
  registry,
  onAdd,
}: {
  registry: NodeRegistry;
  onAdd: (type: string) => void;
}) {
  const [query, setQuery] = useState("");
  const definitions = registry.list().filter((definition) => matchesQuery(definition, query));
  return (
    <div className="grid size-full grid-rows-[auto_minmax(0,1fr)]">
      <div className="px-3 py-2">
        <input
          type="search"
          aria-label="Search nodes"
          placeholder="Search nodes"
          value={query}
          className="w-full"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </div>
      <nav aria-label="Node library" className="scroll-area pb-2">
        {NODE_CATEGORIES.map((category) => {
          const items = definitions.filter((definition) => definition.category === category);
          if (items.length === 0) return null;
          return (
            <section key={category} aria-label={CATEGORY_TITLES[category]}>
              <h2 className="m-0 px-3 pt-2 pb-1 text-[1em] font-semibold">
                {CATEGORY_TITLES[category]}
              </h2>
              <ul className="m-0 list-none p-0">
                {items.map((definition) => (
                  <li key={definition.type}>
                    <button
                      type="button"
                      draggable
                      title={definition.type}
                      className="block w-full truncate border-0 bg-transparent px-5 py-0.5 text-start hover:bg-hover"
                      onDragStart={(event) => {
                        event.dataTransfer.setData(NODE_DRAG_TYPE, definition.type);
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => {
                        onAdd(definition.type);
                      }}
                    >
                      {definition.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {definitions.length === 0 && <p className="m-0 px-3">No matching nodes</p>}
      </nav>
    </div>
  );
}
