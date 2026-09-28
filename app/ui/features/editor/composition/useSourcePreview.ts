import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
  type Composition,
  compositionDuration,
  compositionPosition,
  compositionSpans,
} from '../../../../core/editing/composition/document';
import { previewElementRate } from '../../../../core/editing/live-mix';
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

// The export speeds a clip with `atempo`, which keeps its pitch; so does the monitor.
// A new source resets playbackRate to defaultPlaybackRate, so both carry the speed.
function playAtSpeed(video: HTMLVideoElement, speed: number): void {
  video.preservesPitch = true;
  video.defaultPlaybackRate = speed;
  video.playbackRate = speed;
}

export function useSourcePreview(
  documentId: string,
  media: PublicVideo | null,
  composition: Composition | undefined,
  video: RefObject<HTMLVideoElement | null>,
  /** The edit's speed (`editing.speed`); a composition clip plays at its own speed times it. */
  speed: number,
  updateClock: (time: number) => void,
  report: (error: unknown) => void,
) {
  const [selection, setSelection] = useState<SourceSelection | null>(null);
  const [noClipAtPosition, setNoClipAtPosition] = useState(false);
  // True while the output clock is driven over a disabled span rather than by an element.
  const [blackPlaying, setBlackPlaying] = useState(false);
  const current = useRef<SourceSelection | null>(null);
  const grants = useRef(new Map<string, string>());
  const ready = useRef(false);
  const clock = useRef(0);
  const pending = useRef(0);
  const document = useRef(documentId);
  // Set when playback should continue on the next clip once its element has metadata.
  const resumeAfterLoad = useRef(false);
  const switching = useRef(false);
  // Drives the output clock over a disabled span: no element, black frame, real time.
  const black = useRef<number | null>(null);
  const cancelBlack = useCallback(() => {
    if (black.current !== null) {
      cancelAnimationFrame(black.current);
      black.current = null;
    }
    setBlackPlaying(false);
  }, []);

  const seek = useCallback(
    (milliseconds: number) => {
      if (!media) return;
      cancelBlack();
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
        playAtSpeed(video.current, previewElementRate(selected.speed, speed));
      }
      current.current = selected;
      setSelection(selected);
    },
    [cancelBlack, composition, media, speed, updateClock, video],
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
    cancelBlack();
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
      cancelBlack();
    };
  }, [cancelBlack, documentId, composition, seek, report, video]);

  // The timeline stays on source (or composition) time; the element runs through it at the edit's
  // speed, and the export speeds the assembled composition as one source, clips and black alike.
  useEffect(() => {
    if (!video.current) return;
    if (!composition) playAtSpeed(video.current, speed);
    else if (current.current)
      playAtSpeed(video.current, previewElementRate(current.current.speed, speed));
  }, [composition, speed, video]);

  function onSourceMetadata() {
    if (!composition) {
      if (video.current) playAtSpeed(video.current, speed);
      return;
    }
    if (!video.current || !current.current) return;
    video.current.currentTime = pending.current / 1000;
    playAtSpeed(video.current, previewElementRate(current.current.speed, speed));
    switching.current = false;
    if (resumeAfterLoad.current) {
      resumeAfterLoad.current = false;
      void video.current.play().catch(() => undefined);
    }
  }

  // Play a disabled span on the timeline: no element, black frame, source silent, at edit speed.
  function startBlackSpan(from: number, to: number) {
    if (!composition) return;
    video.current?.pause();
    current.current = null;
    setSelection(null);
    setNoClipAtPosition(true);
    switching.current = true;
    setBlackPlaying(true);
    const startedAt = performance.now();
    const step = (now: number) => {
      const at = Math.min(to, from + (now - startedAt) * speed);
      clock.current = at;
      updateClock(at);
      if (at >= to) {
        black.current = null;
        setBlackPlaying(false);
        switching.current = false;
        resumeAfterLoad.current = true;
        seek(to);
        return;
      }
      black.current = requestAnimationFrame(step);
    };
    black.current = requestAnimationFrame(step);
  }

  // The output clock runs past this clip's out point: keep playing. A contiguous next clip hands
  // over at once; a disabled run in between plays black for its duration, then continues. The
  // last clip parks the clock at the composition end.
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
    if (next.start_ms > spanEnd) {
      startBlackSpan(spanEnd, next.start_ms);
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
    if (!selected || !video.current || switching.current) return;
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
    blackPlaying,
  };
}
