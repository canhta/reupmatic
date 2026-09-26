// A render result's Post button asks Channels to open a new post for that export.
// Kept as a tiny module store because the monitor and the Channels workspace have
// no shared parent beyond App.

let pending: string | null = null;
const listeners = new Set<(exportId: string) => void>();

export function requestPost(exportId: string): void {
  pending = exportId;
  for (const listener of [...listeners]) listener(exportId);
}

export function onPostRequested(listener: (exportId: string) => void): () => void {
  listeners.add(listener);
  if (pending) listener(pending);
  return () => {
    listeners.delete(listener);
  };
}

export function consumePostIntent(exportId: string): void {
  if (pending === exportId) pending = null;
}
