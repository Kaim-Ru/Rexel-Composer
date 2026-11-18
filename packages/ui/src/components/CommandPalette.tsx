import { useEffect, useRef, useState } from "react";

export interface PaletteItem {
  readonly id: string;
  readonly title: string;
  readonly keys?: readonly string[];
  run: () => void;
}

interface Props {
  readonly open: boolean;
  readonly items: readonly PaletteItem[];
  onClose: () => void;
}

export function CommandPalette({ open, items, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      setQuery("");
      setActive(0);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const needle = query.trim().toLowerCase();
  const matches = items.filter((item) => item.title.toLowerCase().includes(needle));
  const current = Math.min(active, Math.max(matches.length - 1, 0));

  const runItem = (item: PaletteItem | undefined) => {
    if (item === undefined) return;
    onClose();
    item.run();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label="Command palette"
      className="mx-auto mt-[10vh] w-[min(36rem,calc(100vw-2rem))] rounded-md shadow-lg"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="flex flex-col gap-1 p-1.5">
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={
            matches[current] === undefined ? undefined : `command-${matches[current].id}`
          }
          aria-label="Type a command"
          placeholder="Type a command"
          value={query}
          className="w-full"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current + 1) % Math.max(matches.length, 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current - 1 + matches.length) % Math.max(matches.length, 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              runItem(matches[current]);
            }
          }}
        />
        <ul
          id="command-palette-list"
          role="listbox"
          className="scroll-area m-0 max-h-[50vh] list-none p-0"
        >
          {matches.map((item, index) => (
            <li
              key={item.id}
              id={`command-${item.id}`}
              role="option"
              aria-selected={index === current}
              className="flex cursor-pointer items-center justify-between gap-4 rounded-sm px-2 py-1 hover:bg-hover aria-selected:bg-selection aria-selected:text-selection-fg"
              onPointerMove={() => {
                setActive(index);
              }}
              onClick={() => {
                runItem(item);
              }}
            >
              <span className="truncate">{item.title}</span>
              {item.keys?.[0] !== undefined && (
                <kbd className="shrink-0 rounded-sm border border-widget-border px-1.5 font-mono text-[0.85em]">
                  {item.keys[0]}
                </kbd>
              )}
            </li>
          ))}
          {matches.length === 0 && <li className="px-2 py-1">No matching commands</li>}
        </ul>
      </div>
    </dialog>
  );
}
