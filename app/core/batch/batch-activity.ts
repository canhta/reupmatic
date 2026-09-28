import type { BatchSnapshot } from './batch-contracts.js';

export type BatchActivity =
  | { kind: 'running'; name: string; phase: string | null; percent: number | null; waiting: number }
  | { kind: 'paused' | 'waiting'; waiting: number }
  | { kind: 'idle' };

const STATUS_LINE_LIMIT = 64;

/** The one status line: batch and editor activity together when they fit, else batch alone. */
export function joinActivity(batch: string, editor: string): string {
  if (!batch || !editor) return batch || editor;
  const both = `${batch} · ${editor}`;
  return both.length <= STATUS_LINE_LIMIT ? both : batch;
}

/** What the queue is doing right now, for the one-line status bar. */
export function batchActivity(snapshot: BatchSnapshot | null): BatchActivity {
  if (!snapshot) return { kind: 'idle' };
  const waiting = snapshot.items.filter(
    (item) => item.state === 'queued' || item.state === 'interrupted',
  ).length;
  const active =
    snapshot.items.find((item) => item.id === snapshot.active_id) ??
    snapshot.items.find((item) => item.state === 'running' || item.state === 'cancelling');
  if (active && (active.state === 'running' || active.state === 'cancelling')) {
    const fraction = active.progress?.fraction;
    return {
      kind: 'running',
      name: active.name,
      phase: active.progress?.phase ?? null,
      percent: fraction == null ? null : Math.round(fraction * 100),
      waiting,
    };
  }
  if (!waiting) return { kind: 'idle' };
  return { kind: snapshot.paused ? 'paused' : 'waiting', waiting };
}
