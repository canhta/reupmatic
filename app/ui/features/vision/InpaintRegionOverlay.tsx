import { type PointerEvent, useEffect, useRef, useState } from 'react';
import type { ProcessingRegion } from '../../../core/processing/recipe';

type Gesture = {
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  frame: DOMRect;
  region: ProcessingRegion;
};

const MIN_SIZE = 0.02;

function clamp(region: ProcessingRegion): ProcessingRegion {
  const width = Math.min(1, Math.max(MIN_SIZE, region.width));
  const height = Math.min(1, Math.max(MIN_SIZE, region.height));
  return {
    x: Math.min(1 - width, Math.max(0, region.x)),
    y: Math.min(1 - height, Math.max(0, region.y)),
    width,
    height,
  };
}

/**
 * Shows the clean-up rectangle over the output frame. Pointer drag moves it, the corner
 * handle resizes it; the numeric fields stay the precise, keyboard-reachable input.
 */
export function InpaintRegionOverlay({
  region,
  onChange,
  disabled,
}: {
  region: ProcessingRegion;
  onChange(region: ProcessingRegion): void;
  disabled: boolean;
}) {
  const [live, setLive] = useState(region);
  const gesture = useRef<Gesture | null>(null);
  // External edits (the numeric fields) win whenever a drag is not in progress.
  useEffect(() => {
    if (!gesture.current) setLive(region);
  }, [region]);

  function start(mode: Gesture['mode'], event: PointerEvent<HTMLElement>) {
    if (disabled) return;
    const frame = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!frame) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { mode, startX: event.clientX, startY: event.clientY, frame, region: live };
  }

  function move(event: PointerEvent<HTMLElement>) {
    const active = gesture.current;
    if (!active) return;
    const dx = (event.clientX - active.startX) / active.frame.width;
    const dy = (event.clientY - active.startY) / active.frame.height;
    const next =
      active.mode === 'move'
        ? { ...active.region, x: active.region.x + dx, y: active.region.y + dy }
        : { ...active.region, width: active.region.width + dx, height: active.region.height + dy };
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
      className="inpaint-region"
      data-inpaint-region="true"
      aria-hidden="true"
      style={{
        left: `${live.x * 100}%`,
        top: `${live.y * 100}%`,
        width: `${live.width * 100}%`,
        height: `${live.height * 100}%`,
        cursor: disabled ? 'default' : 'move',
      }}
      onPointerDown={(event) => start('move', event)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span
        className="inpaint-region-handle"
        style={{ cursor: disabled ? 'default' : 'nwse-resize' }}
        onPointerDown={(event) => start('resize', event)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </div>
  );
}
