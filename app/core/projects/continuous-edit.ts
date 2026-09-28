/** The host's frame clock: requestAnimationFrame in the renderer, a fake in tests. */
export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export interface LatestPerFrame<T> {
  /** Records a value; the next frame delivers the latest one recorded. */
  push(value: T): void;
  /** Delivers a pending value now, such as when a pick ends. */
  flush(): void;
  /** Drops a pending value. */
  cancel(): void;
}

/**
 * Coalesces a continuous control's values (a colour drag, a slider) to at most one delivery per
 * frame. A frame whose work runs long delays the next one, so the rate follows what the document
 * can absorb instead of queueing every input event behind it.
 */
export function latestPerFrame<T>(
  deliver: (value: T) => void,
  frames: FrameScheduler,
): LatestPerFrame<T> {
  let pending: { value: T } | null = null;
  let handle: number | null = null;
  function run() {
    handle = null;
    const due = pending;
    pending = null;
    if (due) deliver(due.value);
  }
  return {
    push(value) {
      pending = { value };
      if (handle === null) handle = frames.request(run);
    },
    flush() {
      if (handle !== null) frames.cancel(handle);
      run();
    },
    cancel() {
      if (handle !== null) frames.cancel(handle);
      handle = null;
      pending = null;
    },
  };
}
