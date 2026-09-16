import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LibraryImportOptions,
  LibraryImportProgress,
  LibraryImportResult,
  LibraryPage,
} from '../../../core/library/library-types';
import { unwrap } from '../../bridge/client';

const PAGE_SIZE = 25;

export function useLibrary() {
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<LibraryPage | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<LibraryImportProgress | null>(null);
  const [imported, setImported] = useState<LibraryImportResult | null>(null);
  const mounted = useRef(true);
  const locked = useRef(false);
  const generation = useRef(0);

  const report = useCallback((reason: unknown) => {
    if (mounted.current) setError(reason instanceof Error ? reason.message : 'LIBRARY_UNAVAILABLE');
  }, []);

  const reload = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const value = await unwrap(
        window.reupmatic.libraryList({ search, offset, limit: PAGE_SIZE }),
      );
      if (!mounted.current || request !== generation.current) return;
      if (!value.items.length && value.total > 0 && offset >= value.total) {
        setOffset(Math.floor((value.total - 1) / PAGE_SIZE) * PAGE_SIZE);
        return;
      }
      setPage(value);
      const visible = new Set(value.items.map((item) => item.id));
      setSelected((current) => new Set([...current].filter((id) => visible.has(id))));
    } catch (reason) {
      if (request === generation.current) report(reason);
    } finally {
      if (mounted.current && request === generation.current) setLoading(false);
    }
  }, [search, offset, report]);

  useEffect(() => {
    mounted.current = true;
    const changed = window.reupmatic.onLibraryChanged(() => {
      void reload();
    });
    const importing = window.reupmatic.onLibraryImport(setProgress);
    const timer = setTimeout(() => {
      void reload();
    }, 200);
    return () => {
      mounted.current = false;
      generation.current += 1;
      clearTimeout(timer);
      changed();
      importing();
    };
  }, [reload]);

  async function action(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (reason) {
      report(reason);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function importFiles(options: LibraryImportOptions) {
    await action(async () => {
      setProgress(null);
      setImported(null);
      const result = await unwrap(window.reupmatic.libraryImport(options));
      if (result) setImported(result);
      await reload();
    });
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return {
    page,
    search,
    offset,
    selected,
    activeId,
    setActiveId,
    loading,
    busy,
    error,
    progress,
    imported,
    reload,
    action,
    importFiles,
    report,
    toggle,
    active: page?.items.find((item) => item.id === activeId) ?? null,
    changeSearch: (value: string) => {
      generation.current += 1;
      setLoading(true);
      setSearch(value);
      setOffset(0);
      setSelected(new Set());
      setActiveId('');
    },
    changePage: (next: number) => {
      generation.current += 1;
      setLoading(true);
      setOffset(Math.max(0, next));
      setSelected(new Set());
      setActiveId('');
    },
    selectPage: (checked: boolean) =>
      setSelected(new Set(checked ? page?.items.map((item) => item.id) : [])),
    clearSelection: () => setSelected(new Set()),
  };
}
