import { type RefObject, useEffect, useRef, useState } from 'react';
import { type Composition, compositionDuration } from '../../../core/editing/composition/document';
import { resolveEditWindow } from '../../../core/editing/edit-recipe';
import type { ProjectMedia } from '../../../core/editing/project-media';
import type { Soundtrack } from '../../../core/editing/soundtrack';
import type { PublicVideo } from '../../../core/media/media-contracts';
import { type ProcessingRecipe, parseProcessingRecipe } from '../../../core/processing/recipe';
import { RenderTracker } from '../../../core/rendering/render-tracker';
import type { VoiceTrack } from '../../../core/speech/synthesis/voice-track';
import type { Cue } from '../../../core/subtitles/cues';
import { unwrap } from '../../bridge/client';

export interface Preview {
  artifact_id: string;
  url: string;
  revision: number;
}

interface RenderInput {
  composition?: Composition;
  soundtrack?: Soundtrack;
  voice?: VoiceTrack;
  logo?: ProjectMedia;
  processing?: ProcessingRecipe;
  media: PublicVideo | null;
  cues: Cue[];
  revision: number;
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

  useEffect(
    () =>
      window.reupmatic.onJob((message) => {
        if (!tracker.current.accepts(message.id)) return;
        if (message.event === 'progress') {
          const phase = message.data.phase;
          setJob({ id: message.id, phase: typeof phase === 'string' ? phase : 'unknown' });
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
      }),
    [report, revision, setStatus],
  );

  async function render(input: RenderInput) {
    if (!input.media || activeRequest.current) return;
    const requestId = crypto.randomUUID();
    const duration = input.composition
      ? compositionDuration(input.composition)
      : input.media.duration_ms;
    try {
      if (input.processing) parseProcessingRecipe(input.processing, input.cues.length > 0);
      resolveEditWindow(input.processing?.editing, duration);
      tracker.current.begin(requestId, input.revision);
      activeRequest.current = requestId;
      setBusy(true);
      setJob({ id: requestId, phase: 'queued' });
      const reply = await unwrap<{ request_id: string }>(
        window.reupmatic.render({
          request_id: requestId,
          asset_id: input.media.asset_id,
          cues: input.cues,
          revision: input.revision,
          ...(input.composition ? { composition: input.composition } : {}),
          ...(input.soundtrack ? { soundtrack: input.soundtrack } : {}),
          ...(input.voice ? { voice: input.voice } : {}),
          ...(input.logo ? { logo: input.logo } : {}),
          ...(input.processing ? { processing: input.processing } : {}),
        }),
      );
      if (tracker.current.acknowledge(reply.request_id)) {
        setJob((current) => current || { id: reply.request_id, phase: 'queued' });
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
