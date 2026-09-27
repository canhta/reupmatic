import { type PointerEvent, useEffect, useRef, useState } from 'react';
import type { CoverBand } from '../../../../core/subtitles/style';

type Gesture = {
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  frame: DOMRect;
  band: CoverBand;
};

const MIN_PCT = 2;

function clamp(band: CoverBand): CoverBand {
  const width_pct = Math.min(100, Math.max(MIN_PCT, band.width_pct));
  const height_pct = Math.min(100, Math.max(MIN_PCT, band.height_pct));
  return {
    ...band,
    x_pct: Math.min(100 - width_pct, Math.max(0, band.x_pct)),
    y_pct: Math.min(100 - height_pct, Math.max(0, band.y_pct)),
    width_pct,
    height_pct,
  };
}

/**
 * The live cover band on the output frame. Pointer drag moves it, the corner handle resizes it;
 * the numeric fields stay the precise, keyboard-reachable input.
 */
export function CoverBandOverlay({
  band,
  onChange,
  disabled,
}: {
  band: CoverBand;
  onChange(band: CoverBand): void;
  disabled: boolean;
}) {
  const [live, setLive] = useState(band);
  const gesture = useRef<Gesture | null>(null);
  // External edits (the numeric fields) win whenever a drag is not in progress.
  useEffect(() => {
    if (!gesture.current) setLive(band);
  }, [band]);

  function start(mode: Gesture['mode'], event: PointerEvent<HTMLElement>) {
    if (disabled) return;
    const frame = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!frame) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { mode, startX: event.clientX, startY: event.clientY, frame, band: live };
  }

  function move(event: PointerEvent<HTMLElement>) {
    const active = gesture.current;
    if (!active) return;
    const dx = ((event.clientX - active.startX) / active.frame.width) * 100;
    const dy = ((event.clientY - active.startY) / active.frame.height) * 100;
    const next =
      active.mode === 'move'
        ? { ...active.band, x_pct: active.band.x_pct + dx, y_pct: active.band.y_pct + dy }
        : {
            ...active.band,
            width_pct: active.band.width_pct + dx,
            height_pct: active.band.height_pct + dy,
          };
    setLive(clamp(next));
  }

  function end(event: PointerEvent<HTMLElement>) {
    if (!gesture.current) return;
    gesture.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onChange(live);
  }

  return (
    <div
      className="cover-band"
      data-cover-band="true"
      aria-hidden="true"
      style={{
        left: `${live.x_pct}%`,
        top: `${live.y_pct}%`,
        width: `${live.width_pct}%`,
        height: `${live.height_pct}%`,
        background: live.color,
        opacity: live.opacity,
        cursor: disabled ? 'default' : 'move',
        pointerEvents: disabled ? 'none' : 'auto',
      }}
      onPointerDown={(event) => start('move', event)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {!disabled && (
        <span
          className="cover-band-handle"
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={(event) => start('resize', event)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      )}
    </div>
  );
}
