export interface AbortableAttempt {
  readonly id: number;
  readonly signal: AbortSignal;
}

export class AbortableAttempts {
  #activeId = 0;
  #abortController: AbortController | null = null;

  start(): AbortableAttempt {
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    this.#activeId += 1;
    return { id: this.#activeId, signal: this.#abortController.signal };
  }

  isCurrent(id: number): boolean {
    return id === this.#activeId;
  }

  abortCurrent(): void {
    this.#abortController?.abort();
  }

  finish(id: number): void {
    if (this.isCurrent(id)) this.#abortController = null;
  }

  invalidate(): void {
    this.#abortController?.abort();
    this.#abortController = null;
    this.#activeId += 1;
  }
}