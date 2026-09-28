import type { TableSortState } from '@astryxdesign/core/Table';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ContentFilterSelection,
  EMPTY_CONTENT_FILTERS,
  toContentFilterQuery,
} from '../../../core/library/content-filters';
import type {
  ContentPage,
  ContentSortKey,
  OriginalImportOptions,
  OriginalImportProgress,
  OriginalImportResult,
} from '../../../core/library/library-contracts';
import { unwrap } from '../../bridge/client';
import { toSortQuery } from '../../design-system/table-sort';

const PAGE_SIZE = 25;

export function useLibrary() {
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<TableSortState<ContentSortKey>>([]);
  const [filters, setFilters] = useState<ContentFilterSelection>(EMPTY_CONTENT_FILTERS);
  const [page, setPage] = useState<ContentPage | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<OriginalImportProgress | null>(null);
  const [imported, setImported] = useState<OriginalImportResult | null>(null);
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
        window.reupmatic.libraryList({
          search,
          offset,
          limit: PAGE_SIZE,
          ...toSortQuery(sort),
          ...toContentFilterQuery(filters),
        }),
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
  }, [search, offset, sort, filters, report]);

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

  async function importFiles(options: OriginalImportOptions) {
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
    sort,
    filters,
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
    changeSort: (next: TableSortState<ContentSortKey>) => {
      generation.current += 1;
      setLoading(true);
      setSort(next);
      setOffset(0);
    },
    changeFilters: (next: ContentFilterSelection) => {
      generation.current += 1;
      setLoading(true);
      setFilters(next);
      setOffset(0);
      setSelected(new Set());
      setActiveId('');
    },
    clearFilters: () => {
      generation.current += 1;
      setLoading(true);
      setFilters(EMPTY_CONTENT_FILTERS);
      setOffset(0);
      setSelected(new Set());
      setActiveId('');
    },
  };
}
