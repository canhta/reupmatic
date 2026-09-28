import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicVideo } from '../../../../core/media/media-contracts';
import type { EditorSnapshot } from '../../../../core/projects/project';
import { unwrap } from '../../../bridge/client';

interface Context {
  documentId: string;
  media: PublicVideo | null;
  snapshot: EditorSnapshot;
  revision: number;
  dirty: boolean;
  opening: boolean;
  projectPath: string | null;
}
interface Draft {
  id: string;
  storedRevision: number;
  savedEditorRevision: number;
  /** A recovered draft this document supersedes, dropped once its work is saved. */
  source?: { id: string; revision: number };
}
interface Status {
  key: string;
  updatedAt?: number;
  error?: string;
}

export function useAutosave(context: Context) {
  const latest = useRef(context);
  latest.current = context;
  const pending = useRef<{ id: string; revision: number } | null>(null);
  const draft = useRef<Draft>({
    id: context.documentId,
    storedRevision: 0,
    savedEditorRevision: -1,
  });
  if (draft.current.id !== context.documentId) {
    draft.current = {
      id: context.documentId,
      storedRevision: 0,
      savedEditorRevision: -1,
      ...(pending.current ? { source: pending.current } : {}),
    };
    pending.current = null;
  }
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState<Status>({ key: 'recoveryIdle' });
  useEffect(() => setStatus({ key: 'recoveryIdle' }), []);

  const flush = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    const captured = latest.current;
    const record = draft.current;
    if (!captured.media || !captured.dirty) return queue.current;
    const asset_id = captured.media.asset_id;
    const snapshot = structuredClone(captured.snapshot);
    const write = async () => {
      if (record.savedEditorRevision >= captured.revision) return;
      if (draft.current === record) setStatus({ key: 'recoverySaving' });
      try {
        const result = await unwrap(
          window.reupmatic.recoverySave({
            id: record.id,
            expected_revision: record.storedRevision,
            asset_id,
            snapshot,
            ...(captured.projectPath ? { project_path: captured.projectPath } : {}),
            ...(record.source ? { source_id: record.source.id } : {}),
          }),
        );
        record.storedRevision = result.revision;
        record.savedEditorRevision = captured.revision;
        // The store dropped the superseded draft in the same write.
        record.source = undefined;
        if (draft.current === record)
          setStatus({
            updatedAt: result.updated_at,
            key:
              latest.current.revision === captured.revision ? 'recoverySaved' : 'recoveryWaiting',
          });
      } catch (error) {
        if (draft.current === record)
          setStatus({
            key: 'recoveryFailed',
            error: error instanceof Error ? error.message : 'RECOVERY_UNAVAILABLE',
          });
        throw error;
      }
    };
    const result = queue.current.catch(() => undefined).then(write);
    queue.current = result;
    void result.catch(() => undefined);
    return result;
  }, []);

  const clearSaved = useCallback((revision: number): Promise<void> => {
    clearTimeout(timer.current);
    const record = draft.current;
    const remove = async () => {
      if (draft.current !== record || latest.current.revision !== revision) return;
      if (record.source) {
        await unwrap(
          window.reupmatic.recoveryDiscard({
            id: record.source.id,
            expected_revision: record.source.revision,
          }),
        ).catch(() => undefined);
        record.source = undefined;
      }
      if (record.storedRevision > 0) {
        await unwrap(
          window.reupmatic.recoveryDiscard({
            id: record.id,
            expected_revision: record.storedRevision,
          }),
        );
      }
      record.storedRevision = 0;
      record.savedEditorRevision = revision;
      setStatus({ key: 'recoveryProjectSaved' });
    };
    const result = queue.current.catch(() => undefined).then(remove);
    queue.current = result;
    void result.catch(() => undefined);
    return result;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision re-arms the debounce on every edit
  useEffect(() => {
    if (!context.media || !context.dirty || context.opening) return;
    setStatus({ key: 'recoveryWaiting' });
    timer.current = setTimeout(() => {
      void flush().catch(() => undefined);
    }, 800);
    return () => clearTimeout(timer.current);
  }, [context.dirty, context.opening, context.media, context.revision, flush]);

  /** Drops this document's draft (and any superseded source) without marking it saved. */
  const discard = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    const record = draft.current;
    const remove = async () => {
      if (draft.current !== record) return;
      if (record.source) {
        await unwrap(
          window.reupmatic.recoveryDiscard({
            id: record.source.id,
            expected_revision: record.source.revision,
          }),
        ).catch(() => undefined);
        record.source = undefined;
      }
      if (record.storedRevision > 0) {
        await unwrap(
          window.reupmatic.recoveryDiscard({
            id: record.id,
            expected_revision: record.storedRevision,
          }),
        ).catch(() => undefined);
        record.storedRevision = 0;
      }
      record.savedEditorRevision = -1;
      setStatus({ key: 'recoveryIdle' });
    };
    const result = queue.current.catch(() => undefined).then(remove);
    queue.current = result;
    void result.catch(() => undefined);
    return result;
  }, []);

  /** Arms the draft a recovered document supersedes, consumed on the next document id. */
  const prepareSource = useCallback((id: string, revision: number) => {
    pending.current = { id, revision };
  }, []);

  const clearPendingSource = useCallback(() => {
    pending.current = null;
  }, []);

  useEffect(
    () =>
      window.reupmatic.onRecoveryFlush(({ request_id }) => {
        void flush()
          .then(
            () => window.reupmatic.recoveryFlushResult(request_id, true),
            () => window.reupmatic.recoveryFlushResult(request_id, false),
          )
          .catch(() => undefined);
      }),
    [flush],
  );

  return { status, flush, clearSaved, discard, prepareSource, clearPendingSource };
}
