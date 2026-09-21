import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
  type Composition,
  compositionDuration,
  compositionSpans,
} from '../../../../core/editing/composition/document';
import type { PublicVideo } from '../../../../core/media/media-contracts';
import { unwrap } from '../../../bridge/client';

export type SourceSelection = {
  id: string;
  url: string;
  name: string;
  start: number;
  end: number;
  offset: number;
  speed: number;
};

/** Audition one source range. Final cuts, captions, effects and mix use sample rendering. */
export function useSourcePreview(
  documentId: string,
  media: PublicVideo | null,
  composition: Composition | undefined,
  video: RefObject<HTMLVideoElement | null>,
  updateClock: (time: number) => void,
  report: (error: unknown) => void,
) {
  const [selection, setSelection] = useState<SourceSelection | null>(null);
  // True once compositionPreview has resolved and a seek confirmed no span
  // covers the current time — a real gap, distinct from grants still loading.
  const [noClipAtPosition, setNoClipAtPosition] = useState(false);
  const current = useRef<SourceSelection | null>(null);
  const grants = useRef(new Map<string, string>());
  const ready = useRef(false);
  const clock = useRef(0);
  const pending = useRef(0);
  const document = useRef(documentId);

  const seek = useCallback(
    (milliseconds: number) => {
      if (!media) return;
      const duration = composition ? compositionDuration(composition) : media.duration_ms;
      const time = Math.max(0, Math.min(Math.round(milliseconds), duration - 1));
      clock.current = time;
      updateClock(time);
      if (!composition) {
        if (video.current) video.current.currentTime = time / 1000;
        return;
      }
      if (!ready.current) return;
      const span = compositionSpans(composition).find(
        (value) => value.start_ms <= time && value.end_ms > time,
      );
      if (!span) {
        current.current = null;
        setSelection(null);
        setNoClipAtPosition(true);
        return;
      }
      const url = grants.current.get(span.clip.id);
      if (!url) return;
      setNoClipAtPosition(false);
      const selected = {
        id: span.clip.id,
        url,
        name: span.clip.source.name,
        start: span.clip.start_ms,
        end: span.clip.end_ms,
        offset: span.start_ms,
        speed: span.clip.speed,
      };
      pending.current = selected.start + (time - selected.offset) * selected.speed;
      if (current.current?.id === selected.id && video.current) {
        video.current.currentTime = pending.current / 1000;
        video.current.playbackRate = selected.speed;
      }
      current.current = selected;
      setSelection(selected);
    },
    [composition, media, updateClock, video],
  );

  useEffect(() => {
    let alive = true;
    if (document.current !== documentId) {
      clock.current = 0;
      document.current = documentId;
    }
    grants.current.clear();
    ready.current = false;
    current.current = null;
    setSelection(null);
    setNoClipAtPosition(false);
    video.current?.pause();
    if (!composition) return;
    void unwrap<{ clips: { id: string; url: string }[] }>(
      window.reupmatic.compositionPreview(composition),
    )
      .then((value) => {
        if (!alive) return;
        grants.current = new Map(value.clips.map((clip) => [clip.id, clip.url]));
        ready.current = true;
        seek(clock.current);
      })
      .catch((reason) => {
        if (alive) report(reason);
      });
    return () => {
      alive = false;
    };
  }, [documentId, composition, seek, report, video]);

  function onSourceMetadata() {
    if (!composition || !video.current || !current.current) return;
    video.current.currentTime = pending.current / 1000;
    video.current.playbackRate = current.current.speed;
  }

  function onSourceTime(milliseconds: number) {
    if (!composition) {
      clock.current = milliseconds;
      updateClock(milliseconds);
      return;
    }
    const selected = current.current;
    if (!selected || !video.current) return;
    const sourceTime = Math.max(selected.start, Math.min(selected.end - 1, milliseconds));
    if (sourceTime !== milliseconds) {
      video.current.pause();
      video.current.currentTime = sourceTime / 1000;
    }
    const time = selected.offset + Math.round((sourceTime - selected.start) / selected.speed);
    clock.current = time;
    updateClock(time);
  }

  return {
    seek,
    onSourceMetadata,
    onSourceTime,
    sourceSelection: selection,
    sourceUrl: composition ? selection?.url : media?.url,
    sourceEmpty: Boolean(composition) && noClipAtPosition,
  };
}
