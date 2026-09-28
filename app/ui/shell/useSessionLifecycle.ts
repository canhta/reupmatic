import { useCallback, useRef } from 'react';
import { useLocaleSync } from './useLocaleSync';

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
