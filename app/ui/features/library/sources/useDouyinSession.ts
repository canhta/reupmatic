import { useCallback, useEffect, useRef, useState } from 'react';
import type { DouyinSessionSnapshot } from '../../../../core/sources/douyin-contracts';
import { unwrap } from '../../../bridge/client';

/** Loads and drives the Douyin connection: status on mount, then Connect/Reconnect/Disconnect.
 * Ticket 01 scope only — no search, discovery or download belongs here. */
export function useDouyinSession() {
  const [snapshot, setSnapshot] = useState<DouyinSessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const locked = useRef(false);

  const report = useCallback((reason: unknown) => {
    if (mounted.current)
      setError(reason instanceof Error ? reason.message : 'DOUYIN_SESSION_UNAVAILABLE');
  }, []);

  const reload = useCallback(async () => {
    try {
      const value = await unwrap(window.reupmatic.douyinStatus());
      if (mounted.current) {
        setSnapshot(value);
        setError('');
      }
    } catch (reason) {
      report(reason);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [report]);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);

  const run = useCallback(
    async (
      action: () => Promise<
        { ok: true; data: DouyinSessionSnapshot } | { ok: false; error: string }
      >,
    ): Promise<boolean> => {
      if (locked.current) return false;
      locked.current = true;
      setBusy(true);
      setError('');
      try {
        const value = await unwrap(action());
        if (mounted.current) setSnapshot(value);
        return true;
      } catch (reason) {
        report(reason);
        return false;
      } finally {
        locked.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [report],
  );

  return {
    snapshot,
    loading,
    busy,
    error,
    connect: () => run(() => window.reupmatic.douyinConnect()),
    reconnect: () => run(() => window.reupmatic.douyinReconnect()),
    verify: () => run(() => window.reupmatic.douyinVerify()),
    disconnect: () => run(() => window.reupmatic.douyinDisconnect()),
    importCookies: (text: string) => run(() => window.reupmatic.douyinImportCookies({ text })),
  };
}
