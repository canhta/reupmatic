/** Correlation only; not a scheduler. A cached result may arrive before its IPC ack. */
export class RenderTracker {
  private current: { id: string; revision: number; terminal: boolean } | null = null;

  begin(id: string, revision: number): void {
    this.current = { id, revision, terminal: false };
  }

  accepts(id: string): boolean {
    return this.current?.id === id && !this.current.terminal;
  }

  finish(id: string): boolean {
    if (!this.accepts(id) || !this.current) return false;
    this.current.terminal = true;
    return true;
  }

  acknowledge(id: string): boolean {
    // An acknowledgement must never reactivate a completed or superseded render.
    return this.accepts(id);
  }

  isCurrentResult(id: string, revision: number, currentRevision: number): boolean {
    return this.current?.id === id && this.current.revision === revision && revision === currentRevision;
  }
}
