import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CatalogSnapshot } from '../../../core/catalog/catalog-snapshot';
import { type Reply, unwrap } from '../../bridge/client';

interface CatalogContextValue {
  snapshot: CatalogSnapshot | null;
  busy: boolean;
  error: string;
  reload(clearError?: boolean): Promise<void>;
  mutate<T>(operation: () => Promise<Reply<T>>): Promise<T | undefined>;
  setDraft(key: string, dirty: boolean): void;
}
const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({
  children,
  onDirty,
}: {
  children: ReactNode;
  onDirty(value: boolean): void;
}) {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const drafts = useRef(new Set<string>());
  const locked = useRef(false);
  const alive = useRef(true);
  const sequence = useRef(0);
  const reload = useCallback(async (clearError = false) => {
    const token = ++sequence.current;
    try {
      const value = await unwrap(window.reupmatic.catalogSnapshot());
      if (alive.current && token === sequence.current) {
        if (clearError) setError('');
        setSnapshot((current) => (current && current.revision > value.revision ? current : value));
      }
    } catch (reason) {
      if (alive.current && token === sequence.current)
        setError(reason instanceof Error ? reason.message : 'CATALOG_UNAVAILABLE');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const unsubscribe = window.reupmatic.onCatalogChanged(() => {
      void reload();
    });
    void reload();
    return () => {
      alive.current = false;
      sequence.current++;
      unsubscribe();
    };
  }, [reload]);

  const mutate = useCallback(
    async <T,>(operation: () => Promise<Reply<T>>): Promise<T | undefined> => {
      if (locked.current || !alive.current) return undefined;
      locked.current = true;
      setBusy(true);
      setError('');
      try {
        const value = await unwrap(operation());
        await reload();
        return value;
      } catch (reason) {
        if (alive.current)
          setError(reason instanceof Error ? reason.message : 'CATALOG_UNAVAILABLE');
        return undefined;
      } finally {
        locked.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [reload],
  );

  const setDraft = useCallback(
    (key: string, dirty: boolean) => {
      if (dirty) drafts.current.add(key);
      else drafts.current.delete(key);
      onDirty(drafts.current.size > 0);
    },
    [onDirty],
  );
  const value = useMemo(
    () => ({ snapshot, busy, error, reload, mutate, setDraft }),
    [snapshot, busy, error, reload, mutate, setDraft],
  );
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('Catalog provider is missing');
  return value;
}

export function useUnsavedCatalogDraft(dirty: boolean): void {
  const { setDraft } = useCatalog();
  const key = useId();
  useEffect(() => {
    setDraft(key, dirty);
    return () => setDraft(key, false);
  }, [key, dirty, setDraft]);
}
