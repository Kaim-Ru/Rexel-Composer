export type Listener = () => void;

export class Observable<State> {
  private readonly listeners = new Set<Listener>();

  constructor(private current: State) {}

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): State => this.current;

  protected update(next: State) {
    if (next === this.current) return;
    this.current = next;
    for (const listener of this.listeners) listener();
  }
}
