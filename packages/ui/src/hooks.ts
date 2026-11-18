import { useSyncExternalStore } from "react";

interface Subscribable<State> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => State;
}

export function useObservable<State>(source: Subscribable<State>): State {
  return useSyncExternalStore(source.subscribe, source.getSnapshot);
}

const MODIFIER_SEPARATOR = "+";

export function matchesKeys(event: KeyboardEvent, keys: readonly string[] | undefined): boolean {
  if (keys === undefined) return false;
  return keys.some((combo) => {
    const parts = combo.split(MODIFIER_SEPARATOR);
    const key = parts.at(-1)?.toLowerCase();
    const ctrl = parts.includes("Ctrl");
    const shift = parts.includes("Shift");
    const alt = parts.includes("Alt");
    const pressed = event.key.toLowerCase();
    const shiftedDigit = shift && event.code === `Digit${key ?? ""}`;
    return (
      (pressed === key || shiftedDigit) &&
      (event.ctrlKey || event.metaKey) === ctrl &&
      event.shiftKey === shift &&
      event.altKey === alt
    );
  });
}

export function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}
