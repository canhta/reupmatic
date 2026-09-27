import JASSUB from 'jassub';
import { type RefObject, useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { unwrap } from '../../bridge/client';
import { useEditor } from './EditorContext';
import { jassubFontOptions } from './jassub-fonts';

/**
 * Draws the worker's ASS on a canvas that is the output frame itself, so `\move`/`\pos` land in
 * the same place live and in the export. JASSUB is canvas-only here; time is driven manually from
 * the editor clock because the canvas is not the source video element.
 */
export function useSubtitleOverlay(canvas: RefObject<HTMLCanvasElement | null>) {
  const { media, composition, ass, getRevision, clock, subtitleCanvas, report } = useEditor();
  const renderer = useRef<JASSUB | null>(null);
  const clockRef = useRef(clock);
  clockRef.current = clock;

  useEffect(() => {
    const element = canvas.current;
    if (composition || !element || !media) return;
    let instance: JASSUB;
    let alive = true;
    let frame = 0;
    try {
      instance = new JASSUB({
        canvas: element,
        subContent: '[Script Info]\nScriptType: v4.00+\n',
        ...jassubFontOptions(),
        queryFonts: false,
      });
    } catch {
      report(new Error('PREVIEW_UNAVAILABLE'));
      return;
    }
    // A canvas-only instance sizes itself from these private fields; the output frame is the box.
    const sized = instance as unknown as { _videoWidth: number; _videoHeight: number };
    sized._videoWidth = subtitleCanvas.width;
    sized._videoHeight = subtitleCanvas.height;
    renderer.current = instance;
    void instance.ready
      .then(async () => {
        if (!alive) return;
        await instance.resize(true);
        const loop = () => {
          if (!alive) return;
          void instance.manualRender(
            {
              expectedDisplayTime: performance.now(),
              width: subtitleCanvas.width,
              height: subtitleCanvas.height,
              mediaTime: clockRef.current / 1000,
            },
            true,
          );
          frame = requestAnimationFrame(loop);
        };
        loop();
      })
      .catch(() => {
        if (alive) report(new Error('PREVIEW_UNAVAILABLE'));
      });
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      renderer.current = null;
      void instance.destroy();
    };
  }, [composition, media, canvas, subtitleCanvas.width, subtitleCanvas.height, report]);

  useEffect(() => {
    const instance = renderer.current;
    if (!instance || !ass) return;
    let alive = true;
    void instance.ready
      .then(async () => {
        if (!alive || ass.revision !== getRevision()) return;
        await instance.renderer.setTrack(ass.text);
        await instance.resize(true);
      })
      .catch(() => {
        if (alive) report(new Error('PREVIEW_UNAVAILABLE'));
      });
    return () => {
      alive = false;
    };
  }, [ass, getRevision, report]);
}

export function useMediaAdapters() {
  const { media, report } = useEditor();
  const [wave, setWave] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    // A media:// element taints the frame path, so draw the waveform from stored peaks only.
    if (!media?.has_audio || !wave) return;
    let alive = true;
    let instance: WaveSurfer | undefined;
    void unwrap<{ peaks: number[]; duration_ms: number }>(
      window.reupmatic.peaks({ asset_id: media.asset_id }),
    )
      .then((data) => {
        if (!alive) return;
        const tokens = getComputedStyle(document.documentElement);
        instance = WaveSurfer.create({
          container: wave,
          peaks: [data.peaks],
          duration: data.duration_ms / 1000,
          height: 28,
          normalize: true,
          waveColor: tokens.getPropertyValue('--color-text-secondary').trim() || undefined,
          progressColor: tokens.getPropertyValue('--accent').trim() || undefined,
        });
        instance.on('error', () => report(new Error('PREVIEW_UNAVAILABLE')));
      })
      .catch((reason) => {
        if (alive) report(reason);
      });
    return () => {
      alive = false;
      instance?.destroy();
    };
  }, [wave, media?.asset_id, media?.has_audio, report]);

  return setWave;
}
