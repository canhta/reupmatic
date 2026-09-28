import { useSyncExternalStore } from 'react';
import type { RecoverySummary } from '../../../../core/projects/recovery/recovery-contracts';
import { unwrap } from '../../../bridge/client';

let drafts: RecoverySummary[] = [];
const subscribers = new Set<() => void>();

function notify() {
  for (const subscriber of subscribers) subscriber();
}

export function refreshRecoveryDrafts(): Promise<RecoverySummary[]> {
  return unwrap<RecoverySummary[]>(window.reupmatic.recoveryList())
    .then((list) => {
      drafts = list;
      notify();
      return list;
    })
    .catch(() => {
      drafts = [];
      notify();
      return drafts;
    });
}

export function useRecoveryDrafts(): RecoverySummary[] {
  return useSyncExternalStore(
    (onStoreChange) => {
      subscribers.add(onStoreChange);
      return () => subscribers.delete(onStoreChange);
    },
    () => drafts,
  );
}
