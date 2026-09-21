import { useSyncExternalStore } from 'react';
import type { RecoverySummary } from '../../../../core/projects/recovery/recovery-contracts';
import { unwrap } from '../../../bridge/client';

// A tiny external store, not a React Context: the header source switcher
// (App.tsx's TopNav) and the recovery notice (EditorWorkspace.tsx) don't
// share a nearby ancestor to host a Context provider, and each independently
// polling `recoveryList()` on its own left one stale after the other's
// discard/open action — the notice kept saying "(2)" after the switcher
// discarded one down to one. One shared list, refreshed from either place.
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
