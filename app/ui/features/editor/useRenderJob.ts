import { compositionDuration, type Composition } from '../../../core/editing/composition/document';
import type { Soundtrack } from '../../../core/editing/soundtrack';
import { resolveEditWindow } from '../../../core/editing/edit-recipe';
import { parseProcessingRecipe, type ProcessingRecipe } from '../../../core/processing/recipe';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { RenderTracker } from '../../../core/rendering/render-tracker';
import type { Cue } from '../../../core/subtitles/cues';
import { unwrap } from '../../bridge/client';
import type { Media, Preview } from './types';

interface RenderInput {
  composition?: Composition;
  soundtrack?: Soundtrack;
  processing?: ProcessingRecipe;
  media: Media | null;
  cues: Cue[];
  revision: number;
  sampleStart: string;
  sampleEnd: string;
}

export function useRenderJob(
  revision: RefObject<number>,
  report: (reason: unknown) => void,
  setStatus: (status: string) => void,
) {
  const tracker = useRef(new RenderTracker());
  const activeRequest = useRef<string | null>(null);
  const [job, setJob] = useState<{ id: string; phase: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => window.reupmatic.onJob(message => {
    if (!tracker.current.accepts(message.id)) return;
    if (message.event === 'progress') {
      setJob({ id: message.id, phase: message.data.phase });
      return;
    }
    tracker.current.finish(message.id);
    activeRequest.current = null;
    setJob(null);
    setBusy(false);
    if (message.event === 'error') {
      report(new Error(message.data.code));
      return;
    }
    setStatus('complete');
    if (tracker.current.isCurrentResult(message.id, message.revision, revision.current)) {
      setPreview({ ...message.data, revision: message.revision });
    }
  }), [report, revision, setStatus]);

  async function render(mode: 'sample' | 'full', input: RenderInput) {
    if (!input.media || activeRequest.current) return;
    const requestId = crypto.randomUUID();
    const duration = input.composition ? compositionDuration(input.composition) : input.media.duration_ms;
    try {
      const start = Math.round(Number(input.sampleStart) * 1000);
      const end = Math.round(Number(input.sampleEnd) * 1000);
      if (mode === 'sample' && (!input.sampleStart.trim() || !input.sampleEnd.trim()
        || !Number.isFinite(start) || !Number.isFinite(end)
        || start < 0 || end <= start || end > duration)) {
        throw new Error('INVALID_CUES');
      }
      if (input.processing) parseProcessingRecipe(input.processing, input.cues.length > 0);
      resolveEditWindow(input.processing?.editing, duration,
        mode === 'sample' ? { start_ms: start, end_ms: end } : undefined);
      tracker.current.begin(requestId, input.revision);
      activeRequest.current = requestId;
      setBusy(true);
      setJob({ id: requestId, phase: 'queued' });
      const reply = await unwrap<{ request_id: string }>(window.reupmatic.render({
        request_id: requestId, asset_id: input.media.asset_id, cues: input.cues,
        revision: input.revision, mode,
        ...(input.composition ? { composition: input.composition } : {}),
        ...(input.soundtrack ? { soundtrack: input.soundtrack } : {}),
        ...(input.processing ? { processing: input.processing } : {}),
        ...(mode === 'sample' ? { start_ms: start, end_ms: end } : {}),
      }));
      if (tracker.current.acknowledge(reply.request_id)) {
        setJob(current => current || { id: reply.request_id, phase: 'queued' });
      }
    } catch (reason) {
      if (tracker.current.accepts(requestId)) {
        tracker.current.finish(requestId);
        activeRequest.current = null;
        setBusy(false);
        setJob(null);
      }
      report(reason);
    }
  }

  return { job, busy, preview, setPreview, render };
}
