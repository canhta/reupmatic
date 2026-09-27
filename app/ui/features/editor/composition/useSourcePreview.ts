import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
  type Composition,
  compositionDuration,
  compositionPosition,
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

export function useSourcePreview(
  documentId: string,
  media: PublicVideo | null,
  composition: Composition | undefined,
  video: RefObject<HTMLVideoElement | null>,
  updateClock: (time: number) => void,
  report: (error: unknown) => void,
) {
  const [selection, setSelection] = useState<SourceSelection | null>(null);
  const [noClipAtPosition, setNoClipAtPosition] = useState(false);
  const current = useRef<SourceSelection | null>(null);
  const grants = useRef(new Map<string, string>());
  const ready = useRef(false);
  const clock = useRef(0);
  const pending = useRef(0);
  const document = useRef(documentId);
  // Set when playback should continue on the next clip once its element has metadata.
  const resumeAfterLoad = useRef(false);
  const switching = useRef(false);

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
      // A disabled span has no frame: the export renders black there, so preview nothing.
      const position = compositionPosition(composition, time);
      const span = position
        ? compositionSpans(composition).find((value) => value.clip.id === position.clip_id)
        : undefined;
      if (!position || !span) {
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
      pending.current = position.source_ms;
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
    resumeAfterLoad.current = false;
    switching.current = false;
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
    switching.current = false;
    if (resumeAfterLoad.current) {
      resumeAfterLoad.current = false;
      void video.current.play().catch(() => undefined);
    }
  }

  // The output clock runs past this clip's out point: jump to the next enabled span and keep
  // playing. Disabled spans are skipped; the last clip parks the clock at the composition end.
  function advanceClip(selected: SourceSelection) {
    if (!composition || switching.current) return;
    const spanEnd = selected.offset + Math.round((selected.end - selected.start) / selected.speed);
    const next = compositionSpans(composition).find(
      (span) => span.clip.enabled && span.start_ms >= spanEnd,
    );
    if (!next) {
      video.current?.pause();
      const end = Math.max(0, compositionDuration(composition) - 1);
      clock.current = end;
      updateClock(end);
      return;
    }
    switching.current = true;
    resumeAfterLoad.current = true;
    seek(next.start_ms);
  }

  function onSourceTime(milliseconds: number) {
    if (!composition) {
      clock.current = milliseconds;
      updateClock(milliseconds);
      return;
    }
    const selected = current.current;
    if (!selected || !video.current) return;
    if (milliseconds >= selected.end) {
      advanceClip(selected);
      return;
    }
    const sourceTime = Math.max(selected.start, milliseconds);
    const time = selected.offset + Math.round((sourceTime - selected.start) / selected.speed);
    clock.current = time;
    updateClock(time);
  }

  function onSourceEnded() {
    const selected = current.current;
    if (composition && selected) advanceClip(selected);
  }

  return {
    seek,
    onSourceMetadata,
    onSourceTime,
    onSourceEnded,
    sourceSelection: selection,
    sourceUrl: composition ? selection?.url : media?.url,
    sourceEmpty: Boolean(composition) && noClipAtPosition,
  };
}
