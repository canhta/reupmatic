import { useSyncExternalStore } from 'react';
import type { RecentEntry } from '../../../../core/projects/recent';
import { unwrap } from '../../../bridge/client';

let items: RecentEntry[] = [];
const subscribers = new Set<() => void>();

function notify() {
  for (const subscriber of subscribers) subscriber();
}

export function refreshRecentItems(): Promise<RecentEntry[]> {
  return unwrap<RecentEntry[]>(window.reupmatic.recentList())
    .then((list) => {
      items = list;
      notify();
      return list;
    })
    .catch(() => {
      items = [];
      notify();
      return items;
    });
}

export function useRecentItems(): RecentEntry[] {
  return useSyncExternalStore(
    (onStoreChange) => {
      subscribers.add(onStoreChange);
      return () => subscribers.delete(onStoreChange);
    },
    () => items,
  );
}
