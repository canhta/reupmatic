import { useCallback, useEffect, useState } from 'react';
import type { DouyinChannel } from '../../../../core/sources/douyin-channel-store';
import { unwrap } from '../../../bridge/client';

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
