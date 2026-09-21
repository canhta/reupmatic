import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { DouyinDownloadRequestItem } from '../../../../core/host-bridge/operations/sources';
import type { DouyinDownloadSnapshot } from '../../../../core/sources/douyin-download';
import { unwrap } from '../../../bridge/client';

interface DouyinDownloadsValue {
  /** The latest whole-run snapshot; `null` before the first run this session. */
  snapshot: DouyinDownloadSnapshot | null;
  busy: boolean;
  error: string;
  /** `saveTo`: D-62's per-run override — a folder picker for this selection only, instead of the
   * default download folder. */
  start(items: DouyinDownloadRequestItem[], saveTo?: boolean): Promise<void>;
  cancel(): Promise<void>;
}

const Context = createContext<DouyinDownloadsValue | null>(null);

/**
 * One owner for the download queue, mounted above both the Search panel (per-candidate state)
 * and the status bar (aggregate). There is deliberately no second queue: the host pushes one
 * snapshot per transition on `douyin-download`, and every consumer reads that same snapshot.
 *
 * The provider starts nothing on mount. `start` is only reachable from the explicit Download (or
 * "Save to…") action, so discovery can never trigger a download (SL-R04). `busy` covers only the
 * enqueue call itself (D-62: the queue keeps running in the background after that resolves), not
 * the whole run — `snapshot.active` is what tells a queued/running item apart from a settled one.
 */
export function DouyinDownloadsProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<DouyinDownloadSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => window.reupmatic.onDouyinDownload(setSnapshot), []);

  const start = useCallback(async (items: DouyinDownloadRequestItem[], saveTo?: boolean) => {
    setError('');
    setBusy(true);
    try {
      // `null` means a picker (the default folder's first-time ask, or "Save to…") was
      // dismissed: a deliberate cancellation, not a failure.
      const result = await unwrap(window.reupmatic.douyinDownload({ items, save_to: saveTo }));
      if (result) setSnapshot(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'DOUYIN_DOWNLOAD_UNAVAILABLE');
    } finally {
      setBusy(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    try {
      await unwrap(window.reupmatic.douyinDownloadCancel());
    } catch {
      // The run may already have settled; the flag is what the host uses.
    }
  }, []);

  return (
    <Context.Provider value={{ snapshot, busy, error, start, cancel }}>{children}</Context.Provider>
  );
}

export function useDouyinDownloads(): DouyinDownloadsValue {
  const value = useContext(Context);
  if (!value) throw new Error('DOUYIN_DOWNLOADS_PROVIDER_MISSING');
  return value;
}
