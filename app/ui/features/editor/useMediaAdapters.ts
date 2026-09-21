import JASSUB from 'jassub';
import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { unwrap } from '../../bridge/client';
import { useEditor } from './EditorContext';

export function useMediaAdapters() {
  const { media, composition, video, ass, getRevision, report } = useEditor();
  const [wave, setWave] = useState<HTMLDivElement | null>(null);
  const renderer = useRef<JASSUB | null>(null);

  useEffect(() => {
    if (composition || !video.current || !media) return;
    let instance: JASSUB;
    let alive = true;
    try {
      instance = new JASSUB({
        video: video.current,
        subContent: '[Script Info]\nScriptType: v4.00+\n',
        queryFonts: false,
      });
    } catch {
      report(new Error('PREVIEW_UNAVAILABLE'));
      return;
    }
    renderer.current = instance;
    void instance.ready.catch(() => {
      if (alive) report(new Error('PREVIEW_UNAVAILABLE'));
    });
    return () => {
      alive = false;
      renderer.current = null;
      void instance.destroy();
    };
  }, [composition, media?.asset_id, report, video, media]);

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

  useEffect(() => {
    // The original-audio lane draws this one waveform in both modes. It renders from the stored
    // peaks alone: binding it to the monitor `<video>` would tear it down whenever the source
    // player remounts (composition selection), and a `media://` element is a tainted source for
    // the frame path. A callback ref supplies the node because the timeline library mounts it
    // from its own render, which can happen after this component's first commit.
    if (!media?.has_audio || !wave) return;
    let alive = true;
    let instance: WaveSurfer | undefined;
    void unwrap<{ peaks: number[]; duration_ms: number }>(
      window.reupmatic.peaks({ asset_id: media.asset_id }),
    )
      .then((data) => {
        if (!alive) return;
        // WaveSurfer paints to a canvas, which cannot read CSS custom properties; read the
        // current token values once so the lane waveform still follows the theme.
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
