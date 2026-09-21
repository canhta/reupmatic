/**
 * The persistent Douyin download queue (D-62: "runs queue instead of refusing while another
 * runs"). `runDouyinDownloads` (`douyin-download.ts`) drives one fixed selection array to
 * completion; this wraps the same per-item processing (`processDouyinDownloadItem`) around a live
 * item list that can grow while it runs, so a second selection while one is active is appended
 * rather than refused with `DOUYIN_DOWNLOAD_BUSY`.
 *
 * One transfer runs at a time — the queue is sources-feature state, not `BatchQueue` (D-62: a
 * network download must never sit behind the render coordinator). It is deliberately not a
 * `WorkspaceParticipant` itself; the Electron host wraps it as one so `close()` can also cancel
 * the in-flight worker ticket, which this module has no access to.
 */

import type {
  DouyinDownloadDeps,
  DouyinDownloadItemState,
  DouyinDownloadSelection,
  DouyinDownloadSnapshot,
} from './douyin-download.js';
import { processDouyinDownloadItem, snapshotOf } from './douyin-download.js';

export interface DouyinDownloadQueue {
  /** Appends a selection, deduped by `aweme_id` against whatever is already queued/running in
   * this session and against the Library (`findHeld`). Starts processing if idle. Returns the
   * selections actually added (a duplicate is silently dropped, never an error: the caller asked
   * for "this item downloaded", and it already is, or will be). */
  enqueue(selections: readonly DouyinDownloadSelection[]): DouyinDownloadSelection[];
  /** Stops the active item at its next cancellation checkpoint and drops every not-yet-started
   * item from the queue; already-finished items (complete/failed/reused) are kept as history. */
  cancel(): void;
  snapshot(): DouyinDownloadSnapshot;
  readonly processing: boolean;
}

export function createDouyinDownloadQueue(deps: DouyinDownloadDeps): DouyinDownloadQueue {
  const now = deps.now ?? Date.now;
  let items: DouyinDownloadItemState[] = [];
  const selectionByAwemeId = new Map<string, DouyinDownloadSelection>();
  let processing = false;
  let cancelRequested = false;

  const isCancelled = () => cancelRequested;
  const emit = () => deps.onProgress?.(snapshotOf(items, cancelRequested));

  function isDuplicate(awemeId: string): boolean {
    const pending = items.some(
      (item) => item.awemeId === awemeId && (item.state === 'queued' || item.state === 'running'),
    );
    if (pending) return true;
    return Boolean(deps.findHeld(awemeId));
  }

  function enqueue(selections: readonly DouyinDownloadSelection[]): DouyinDownloadSelection[] {
    const added: DouyinDownloadSelection[] = [];
    for (const selection of selections) {
      if (isDuplicate(selection.awemeId)) continue;
      // One entry per aweme_id: a retry replaces the finished attempt, so a row looked up by id
      // shows the retry and the run's counts never include the superseded attempt.
      items = items.filter((item) => item.awemeId !== selection.awemeId);
      items.push({ awemeId: selection.awemeId, state: 'queued' });
      selectionByAwemeId.set(selection.awemeId, selection);
      added.push(selection);
    }
    if (added.length > 0) emit();
    if (!processing) void run();
    return added;
  }

  async function run(): Promise<void> {
    processing = true;
    try {
      for (;;) {
        if (cancelRequested) break;
        const item = items.find((candidate) => candidate.state === 'queued');
        if (!item) break;
        const selection = selectionByAwemeId.get(item.awemeId);
        if (!selection) {
          // Unreachable in practice (every queued item has a selection recorded at enqueue time),
          // but an item with no selection can never be processed, so drop it rather than spin.
          items = items.filter((candidate) => candidate !== item);
          continue;
        }
        const outcome = await processDouyinDownloadItem(
          item,
          selection,
          deps,
          now,
          isCancelled,
          emit,
        );
        emit();
        if (outcome === 'break') break;
      }
    } finally {
      processing = false;
      if (cancelRequested) {
        // "cancel clears the queue" (D-62): a not-yet-started item disappears rather than sitting
        // forever as a stale `queued` row; finished history (complete/failed/reused) stays.
        items = items.filter((item) => item.state !== 'queued');
        cancelRequested = false;
        emit();
      }
    }
  }

  function cancel(): void {
    if (!processing) {
      // Nothing is running to interrupt; still "clears the queue" for symmetry, and — critically —
      // never leaves a stale `cancelRequested` flag for the *next* `enqueue()`'s `run()` to trip
      // over and wipe out before it processes anything.
      if (items.some((item) => item.state === 'queued')) {
        items = items.filter((item) => item.state !== 'queued');
        emit();
      }
      return;
    }
    cancelRequested = true;
  }

  function snapshot(): DouyinDownloadSnapshot {
    return snapshotOf(items, cancelRequested);
  }

  return {
    enqueue,
    cancel,
    snapshot,
    get processing() {
      return processing;
    },
  };
}
