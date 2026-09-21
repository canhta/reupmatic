import { useCallback, useEffect, useState } from 'react';
import { unwrap } from '../../../bridge/client';

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
