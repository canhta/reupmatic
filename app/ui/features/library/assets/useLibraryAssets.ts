import { useCallback, useEffect, useRef, useState } from 'react';
import type { LibraryAsset, LibraryAssetPage, LibraryAssetPreview, LibraryAvailability, LibraryLinkKind } from '../../../../core/library/library-types';
import { unwrap } from '../../../bridge/client';

export function useLibraryAssets(itemId?: string) {
  const [kind, setKind] = useState<LibraryLinkKind | 'all'>('all');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<LibraryAssetPage | null>(null);
  const [selected, setSelected] = useState<LibraryAsset | null>(null);
  const [preview, setPreview] = useState<LibraryAssetPreview | null>(null);
  const [availability, setAvailability] = useState<LibraryAvailability>('unchecked');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requests = useRef(0), operations = useRef(0);
  const mounted = useRef(true), locked = useRef(false);

  const reload = useCallback(async () => {
    const token = ++requests.current;
    setLoading(true);
    try {
      const result = await unwrap(window.reupmatic.libraryAssets({ kind, search, offset, limit: 20,
        ...(itemId ? { item_id: itemId } : {}) }));
      if (!mounted.current || token !== requests.current) return;
      if (result.total > 0 && !result.items.length && offset >= result.total) {
        setOffset(Math.floor((result.total - 1) / 20) * 20);
        return;
      }
      setPage(result);
      setSelected(current => current ? result.items.find(asset => asset.id === current.id) ?? null : null);
    } catch (reason) {
      if (mounted.current && token === requests.current) setError(reason instanceof Error ? reason.message : 'LIBRARY_UNAVAILABLE');
    } finally { if (mounted.current && token === requests.current) setLoading(false); }
  }, [kind, search, offset, itemId]);

  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(() => { void reload(); }, 150);
    const stop = window.reupmatic.onLibraryChanged(() => { void reload(); });
    return () => { mounted.current = false; requests.current++; operations.current++; clearTimeout(timer); stop(); };
  }, [reload]);

  useEffect(() => { setPreview(null); setAvailability('unchecked'); operations.current++; }, [selected?.id]);

  function select(asset: LibraryAsset | null) {
    operations.current++;
    setSelected(asset); setPreview(null); setAvailability('unchecked'); setError('');
  }
  function query(change: () => void) {
    requests.current++;
    select(null); setLoading(true); setPage(null); change();
  }
  async function action(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await work(); }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'LIBRARY_UNAVAILABLE'); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  async function inspect(asset: LibraryAsset, play: boolean) {
    const token = ++operations.current;
    setPreview(null);
    const input = { item_id: asset.item_id, link_id: asset.id };
    const checked = await unwrap(window.reupmatic.libraryAssetCheck(input));
    if (!mounted.current || token !== operations.current) return;
    setAvailability(checked.availability);
    if (play && checked.availability === 'available') {
      const result = await unwrap(window.reupmatic.libraryAssetPreview(input));
      if (mounted.current && token === operations.current) setPreview(result);
    }
  }
  async function attach(attachmentKind: LibraryLinkKind) {
    if (!itemId) return;
    await unwrap(window.reupmatic.libraryAssetAttach({ item_id: itemId, kind: attachmentKind }));
    await reload();
  }
  return { kind, search, page, loading, busy, error, selected, preview, availability, reload, select, action, inspect, attach,
    changeKind: (value: LibraryLinkKind | 'all') => query(() => { setKind(value); setOffset(0); }),
    changeSearch: (value: string) => query(() => { setSearch(value); setOffset(0); }),
    changePage: (value: number) => query(() => setOffset(Math.max(0, value))),
  };
}
