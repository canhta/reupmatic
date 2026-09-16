import { useCallback, useEffect, useRef, useState } from 'react';
import type { BatchDraft, BatchSelection, BatchSnapshot } from '../../../core/batch/batch-types';
import { type ProcessingRecipe, parseProcessingRecipe } from '../../../core/processing/recipe';
import { unwrap } from '../../bridge/client';

export function useBatchQueue(onDirty: (dirty: boolean) => void) {
  const [processing, setProcessing] = useState<ProcessingRecipe>();
  const [drafts, setDrafts] = useState<BatchDraft[]>([]);
  const [output, setOutput] = useState<{ output_id: string; name: string } | null>(null);
  const [snapshot, setSnapshot] = useState<BatchSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState<{ name: string; code: string }[]>([]);
  const submissionId = useRef(crypto.randomUUID());
  const latest = useRef(-1);
  const mounted = useRef(true);
  const locked = useRef(false);

  const accept = useCallback((value: BatchSnapshot) => {
    if (!mounted.current || value.version < latest.current) return;
    latest.current = value.version;
    setSnapshot(value);
  }, []);

  const report = useCallback((reason: unknown) => {
    if (mounted.current) setError(reason instanceof Error ? reason.message : 'BATCH_FAILED');
  }, []);

  const reload = useCallback(async () => {
    try {
      accept(await unwrap(window.reupmatic.batchSnapshot()));
      if (mounted.current) setError('');
    } catch (reason) {
      report(reason);
    }
  }, [accept, report]);

  useEffect(() => {
    mounted.current = true;
    // Subscribe first; the version guard rejects a late initial snapshot.
    const off = window.reupmatic.onBatch(accept);
    void reload();
    return () => {
      mounted.current = false;
      off();
    };
  }, [accept, reload]);

  useEffect(() => {
    onDirty(drafts.length > 0 || Boolean(processing));
  }, [drafts.length, processing, onDirty]);

  async function action(work: () => Promise<void>) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
      return true;
    } catch (reason) {
      report(reason);
      return false;
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function changeDrafts(update: (items: BatchDraft[]) => BatchDraft[]) {
    setDrafts(update);
    submissionId.current = crypto.randomUUID();
  }

  function stage(selected: BatchSelection) {
    changeDrafts((current) => {
      const existing = new Set(current.map((item) => item.draft_key));
      return [...current, ...selected.items.filter((item) => !existing.has(item.draft_key))];
    });
    setRejected(selected.rejected);
    setExpanded(true);
  }

  async function pickVideos() {
    await action(async () => {
      const selected = await unwrap(window.reupmatic.batchPickVideos());
      if (selected) stage(selected);
    });
  }

  async function addLibraryItems(ids: string[]) {
    return action(async () => {
      stage(await unwrap(window.reupmatic.batchFromLibrary(ids)));
    });
  }

  async function pickOutput() {
    await action(async () => {
      const selected = await unwrap(window.reupmatic.batchPickDirectory());
      if (selected) {
        setOutput(selected);
        submissionId.current = crypto.randomUUID();
      }
    });
  }

  async function attachSubtitle(key: string) {
    await action(async () => {
      const selected = await unwrap(window.reupmatic.batchPickSubtitle());
      if (!selected) return;
      changeDrafts((items) =>
        items.map((item) => (item.draft_key === key ? { ...item, ...selected } : item)),
      );
    });
  }

  function removeSubtitle(key: string) {
    changeDrafts((items) =>
      items.map((item) => {
        if (item.draft_key !== key) return item;
        const { draft_key, asset_id, name, duration_ms } = item;
        return { draft_key, asset_id, name, duration_ms };
      }),
    );
  }

  async function enqueue() {
    if (!output || !drafts.length || drafts.length > 100) return;
    await action(async () => {
      if (processing)
        parseProcessingRecipe(
          processing,
          drafts.some((item) => Boolean(item.subtitle_id)),
        );
      accept(
        await unwrap(
          window.reupmatic.batchEnqueue({
            request_id: submissionId.current,
            output_id: output.output_id,
            ...(processing ? { processing } : {}),
            items: drafts.map((item) => ({
              asset_id: item.asset_id,
              ...(item.subtitle_id ? { subtitle_id: item.subtitle_id } : {}),
            })),
          }),
        ),
      );
      changeDrafts(() => []);
      setRejected([]);
      setProcessing(undefined);
    });
  }

  async function control(command: 'pause' | 'resume' | 'cancel' | 'retry' | 'reveal', id = '') {
    await action(async () => {
      const api = window.reupmatic;
      if (command === 'reveal') {
        await unwrap(api.batchReveal(id));
        return;
      }
      const request =
        command === 'pause'
          ? api.batchPause()
          : command === 'resume'
            ? api.batchResume()
            : command === 'retry'
              ? api.batchRetry(id)
              : api.batchCancel(id);
      accept(await unwrap(request));
    });
  }

  return {
    processing,
    changeProcessing: (value: ProcessingRecipe | undefined) => {
      if (locked.current) return;
      setProcessing(value);
      submissionId.current = crypto.randomUUID();
    },
    drafts,
    output,
    snapshot,
    busy,
    error,
    rejected,
    reload,
    pickVideos,
    pickOutput,
    expanded,
    setExpanded,
    addLibraryItems,
    attachSubtitle,
    removeSubtitle,
    enqueue,
    control,
    removeVideo: (key: string) =>
      changeDrafts((items) => items.filter((item) => item.draft_key !== key)),
  };
}
