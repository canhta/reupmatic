import { useCallback, useRef, useState } from 'react';
import type { DouyinSearchViewOutcome } from '../../../../core/sources/douyin-search';
import { unwrap } from '../../../bridge/client';

/**
 * One Search action's state: the outcome, the in-flight flag, and the candidate selection the
 * user is building. Discovery only — nothing here downloads, spends or starts automation.
 */
export function useDouyinSearch() {
  const [outcome, setOutcome] = useState<DouyinSearchViewOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const locked = useRef(false);

  const run = useCallback(async (text: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    // A new search replaces the previous result set: keeping a stale selection across two
    // different channels would let a download act on an item the user can no longer see.
    setOutcome(null);
    setSelected(new Set());
    try {
      setOutcome(await unwrap(window.reupmatic.douyinSearch({ text })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'DOUYIN_SESSION_UNAVAILABLE');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }, []);

  const result = outcome?.status === 'recognized' ? outcome.result : null;

  return {
    outcome,
    result,
    busy,
    error,
    selected,
    run,
    toggle: (awemeId: string, checked: boolean) =>
      setSelected((current) => {
        const next = new Set(current);
        if (checked) next.add(awemeId);
        else next.delete(awemeId);
        return next;
      }),
    clearSelection: () => setSelected(new Set()),
  };
}
