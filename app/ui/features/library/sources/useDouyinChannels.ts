import { useCallback, useEffect, useState } from 'react';
import type { DouyinChannel } from '../../../../core/sources/douyin-channel-store';
import { unwrap } from '../../../bridge/client';

/**
 * The saved Douyin channels behind the Downloads tab. The host upserts a channel whenever a
 * search returns one, so the renderer only reads the list; `reload` is called again after a
 * search settles to pick up the channel that search just saved.
 */
export function useDouyinChannels() {
  const [list, setList] = useState<DouyinChannel[]>([]);
  const reload = useCallback(async () => {
    try {
      setList(await unwrap(window.reupmatic.douyinChannels()));
    } catch {
      setList([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { list, reload };
}
