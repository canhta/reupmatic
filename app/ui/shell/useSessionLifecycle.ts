import { useCallback, useRef } from 'react';
import { useLocaleSync } from './useLocaleSync';

/**
 * Owns the two session facts the host process needs outside of any one feature area: whether
 * anything in the session is unsaved, and the current UI language (used for the host's own
 * close-confirmation dialogs, via `useLocaleSync`). Generalizes `CatalogProvider`'s own key-based
 * dirty-draft tracking to the whole session, so new dirty sources register themselves rather than
 * being enumerated here. The app's one window/root (D-57 removed the independent Settings
 * window), so this is the app's only mount of `useLocaleSync`.
 */
export function useSessionLifecycle(): { registerDirty(key: string, dirty: boolean): void } {
  const dirtyKeys = useRef(new Set<string>());

  const registerDirty = useCallback((key: string, dirty: boolean) => {
    if (dirty) dirtyKeys.current.add(key);
    else dirtyKeys.current.delete(key);
    void window.reupmatic.sessionDirty(dirtyKeys.current.size > 0);
  }, []);

  useLocaleSync();

  return { registerDirty };
}
