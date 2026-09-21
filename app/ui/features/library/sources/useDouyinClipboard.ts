import { useCallback, useEffect, useState } from 'react';
import { unwrap } from '../../../bridge/client';

/**
 * Whether the OS clipboard currently holds non-empty text, re-checked on mount and whenever the
 * window regains focus — the moment a user who just copied a link comes back to the app. The
 * clipboard shortcut is pointless with an empty clipboard, so its button is only offered when
 * there is something to read. `read()` returns the text and refreshes the flag.
 */
export function useDouyinClipboard(): { hasText: boolean; read(): Promise<string> } {
  const [hasText, setHasText] = useState(false);
  const read = useCallback(async () => {
    const { text } = await unwrap(window.reupmatic.douyinClipboardText());
    setHasText(text.trim().length > 0);
    return text;
  }, []);

  useEffect(() => {
    const refresh = () => {
      void read().catch(() => setHasText(false));
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [read]);

  return { hasText, read };
}
