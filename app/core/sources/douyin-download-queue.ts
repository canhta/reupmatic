// One transfer at a time; a second selection is appended, not refused.

import type {
  DouyinDownloadDeps,
  DouyinDownloadItemState,
  DouyinDownloadSelection,
  DouyinDownloadSnapshot,
} from './douyin-download.js';
import { processDouyinDownloadItem, snapshotOf } from './douyin-download.js';

export interface DouyinDownloadQueue {
  enqueue(selections: readonly DouyinDownloadSelection[]): DouyinDownloadSelection[];
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
        // Cancel clears queued items; finished history stays.
        items = items.filter((item) => item.state !== 'queued');
        cancelRequested = false;
        emit();
      }
    }
  }

  function cancel(): void {
    if (!processing) {
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
