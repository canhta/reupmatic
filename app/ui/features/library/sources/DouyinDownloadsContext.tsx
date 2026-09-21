import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { DouyinDownloadRequestItem } from '../../../../core/host-bridge/operations/sources';
import type { DouyinDownloadSnapshot } from '../../../../core/sources/douyin-download';
import { unwrap } from '../../../bridge/client';

interface DouyinDownloadsValue {
  snapshot: DouyinDownloadSnapshot | null;
  busy: boolean;
  error: string;
  start(items: DouyinDownloadRequestItem[], saveTo?: boolean): Promise<void>;
  cancel(): Promise<void>;
}

const Context = createContext<DouyinDownloadsValue | null>(null);

export function DouyinDownloadsProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<DouyinDownloadSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => window.reupmatic.onDouyinDownload(setSnapshot), []);

  const start = useCallback(async (items: DouyinDownloadRequestItem[], saveTo?: boolean) => {
    setError('');
    setBusy(true);
    try {
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
    } catch {}
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
