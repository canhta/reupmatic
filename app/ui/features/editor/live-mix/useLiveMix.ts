import { type RefObject, useEffect, useRef, useState } from 'react';
import type { Composition } from '../../../../core/editing/composition/document';
import type { EditingRecipe } from '../../../../core/editing/edit-recipe';
import {
  duckKey,
  duckWorkletParams,
  fadeGainAt,
  linearGain,
  soundtrackWindow,
  voiceLineSchedule,
  voiceWindow,
} from '../../../../core/editing/live-mix';
import type { Soundtrack } from '../../../../core/editing/soundtrack';
import type { PublicVideo } from '../../../../core/media/media-contracts';
import type { VoiceTrack } from '../../../../core/speech/synthesis/voice-track';
import { unwrap } from '../../../bridge/client';

// Served from public/ so Vite does not inline it as a data: URL the CSP rejects.
const WORKLET_URL = new URL('duck-envelope.js', document.baseURI).href;
const WORKLET_NAME = 'duck-envelope';
// createMediaElementSource may only run once per element; a StrictMode remount reuses it.
const elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

export interface LiveMixInput {
  video: RefObject<HTMLVideoElement | null>;
  media: PublicVideo | null;
  composition: Composition | undefined;
  soundtrack: Soundtrack | undefined;
  voiceTrack: VoiceTrack | undefined;
  editing: EditingRecipe | undefined;
  /** False while the result view replaces the live source. */
  enabled: boolean;
}

interface Graph {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  originalGain: GainNode;
  musicVolume: GainNode;
  musicDuck: GainNode;
  voiceGain: GainNode;
  worklet: AudioWorkletNode | null;
  musicBuffer: AudioBuffer | null;
  voiceBuffer: AudioBuffer | null;
  sources: AudioScheduledSourceNode[];
  anchorCtx: number;
  anchorMediaMs: number;
  rate: number;
}

export function useLiveMix(input: LiveMixInput): { active: boolean; error: string } {
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const contextRef = useRef<AudioContext | null>(null);
  const graphRef = useRef<Graph | null>(null);

  const soundtrackKey = JSON.stringify(input.soundtrack ?? null);
  const voiceKey = JSON.stringify(input.voiceTrack ?? null);
  const editingKey = JSON.stringify(input.editing ?? null);
  const compositionKey = JSON.stringify(input.composition ?? null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the JSON keys are the identities.
  useEffect(() => {
    const video = input.video.current;
    const hasMusic = Boolean(input.soundtrack && !input.soundtrack.muted);
    const hasVoice = Boolean(input.voiceTrack && !input.voiceTrack.muted);
    const wanted =
      input.enabled && Boolean(input.media) && !input.composition && (hasMusic || hasVoice);
    if (!video || !wanted) {
      teardown();
      setActive(false);
      return;
    }

    const element = video;
    let alive = true;
    void activate(element, hasMusic, hasVoice, () => alive).catch((reason) => {
      if (!alive) return;
      setError(reason instanceof Error ? reason.message : 'PREVIEW_UNAVAILABLE');
    });

    function onPlay() {
      if (!graphRef.current) return;
      void resume().then(() => schedule(element.currentTime * 1000));
    }
    function onPause() {
      stopSources();
    }
    function onEnded() {
      stopSources();
    }
    function onSeek() {
      if (graphRef.current && !element.paused) schedule(element.currentTime * 1000);
    }
    function onRate() {
      if (graphRef.current && !element.paused) schedule(element.currentTime * 1000);
    }
    element.addEventListener('play', onPlay);
    element.addEventListener('pause', onPause);
    element.addEventListener('ended', onEnded);
    element.addEventListener('seeking', onSeek);
    element.addEventListener('ratechange', onRate);

    return () => {
      alive = false;
      element.removeEventListener('play', onPlay);
      element.removeEventListener('pause', onPause);
      element.removeEventListener('ended', onEnded);
      element.removeEventListener('seeking', onSeek);
      element.removeEventListener('ratechange', onRate);
      teardown();
    };
  }, [soundtrackKey, voiceKey, editingKey, input.media?.asset_id, input.enabled, compositionKey]);

  function context(): AudioContext {
    if (!contextRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      contextRef.current = new Ctor();
    }
    return contextRef.current;
  }

  async function activate(
    video: HTMLVideoElement,
    hasMusic: boolean,
    hasVoice: boolean,
    isAlive: () => boolean,
  ): Promise<void> {
    const ctx = context();
    let source = elementSources.get(video);
    if (!source) {
      source = ctx.createMediaElementSource(video);
      elementSources.set(video, source);
    } else {
      // Rebuild from a clean fan-out so a failed attempt never doubles the original.
      source.disconnect();
    }
    const originalGain = ctx.createGain();
    const musicVolume = ctx.createGain();
    const musicDuck = ctx.createGain();
    const voiceGain = ctx.createGain();
    source.connect(originalGain);
    originalGain.connect(ctx.destination);
    musicVolume.connect(musicDuck);
    musicDuck.connect(ctx.destination);
    voiceGain.connect(ctx.destination);

    const editing = input.editing;
    const replaced =
      Boolean(input.soundtrack && !input.soundtrack.muted && input.soundtrack.mode === 'replace') ||
      Boolean(input.voiceTrack && !input.voiceTrack.muted && input.voiceTrack.mode === 'replace');
    originalGain.gain.value =
      editing?.audio?.muted || replaced ? 0 : linearGain(editing?.audio?.gain_db ?? 0);
    musicVolume.gain.value = linearGain(input.soundtrack?.gain_db ?? 0);
    voiceGain.gain.value = linearGain(input.voiceTrack?.gain_db ?? 0);

    const key = duckKey(input.voiceTrack, input.soundtrack, editing, Boolean(input.media));
    let worklet: AudioWorkletNode | null = null;
    if (key && input.soundtrack) {
      try {
        await ctx.audioWorklet.addModule(WORKLET_URL);
        worklet = new AudioWorkletNode(ctx, WORKLET_NAME, {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        const params = duckWorkletParams(
          input.soundtrack.duck.amount_db,
          input.soundtrack.duck.release_ms,
          ctx.sampleRate,
        );
        setParam(worklet, 'thresholdDb', params.thresholdDb);
        setParam(worklet, 'amountDb', params.amountDb);
        setParam(worklet, 'ratio', params.ratio);
        setParam(worklet, 'attack', params.attack);
        setParam(worklet, 'release', params.release);
        musicDuck.gain.value = 0;
        worklet.connect(musicDuck.gain);
        (key === 'voice' ? voiceGain : originalGain).connect(worklet);
      } catch {
        worklet = null;
        musicDuck.gain.value = 1;
      }
    } else {
      musicDuck.gain.value = 1;
    }

    const [musicBuffer, voiceBuffer] = await Promise.all([
      hasMusic && input.soundtrack ? decode(ctx, await musicUrl(input.soundtrack)) : null,
      hasVoice && input.voiceTrack ? decode(ctx, await voiceUrl(input.voiceTrack)) : null,
    ]);
    if (!isAlive()) return;

    graphRef.current = {
      context: ctx,
      source,
      originalGain,
      musicVolume,
      musicDuck,
      voiceGain,
      worklet,
      musicBuffer,
      voiceBuffer,
      sources: [],
      anchorCtx: ctx.currentTime,
      anchorMediaMs: video.currentTime * 1000,
      rate: video.playbackRate || 1,
    };
    setError('');
    setActive(true);
    if (!video.paused) {
      await resume();
      schedule(video.currentTime * 1000);
    }
  }

  function setParam(node: AudioWorkletNode, name: string, value: number): void {
    const param = node.parameters.get(name);
    if (param) param.value = value;
  }

  async function musicUrl(track: Soundtrack): Promise<string> {
    return (await unwrap<{ url: string }>(window.reupmatic.audioPreview(track))).url;
  }

  async function voiceUrl(track: VoiceTrack): Promise<string> {
    return (
      await unwrap<{ url: string }>(window.reupmatic.synthesisPreview(track.artifact.artifact_id))
    ).url;
  }

  async function decode(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
    const response = await fetch(url);
    if (!response.ok) throw new Error('PREVIEW_UNAVAILABLE');
    return ctx.decodeAudioData(await response.arrayBuffer());
  }

  async function resume(): Promise<void> {
    const graph = graphRef.current;
    if (!graph) return;
    if (graph.context.state === 'suspended') await graph.context.resume();
    graph.anchorCtx = graph.context.currentTime;
    graph.anchorMediaMs = graph.source.mediaElement?.currentTime
      ? graph.source.mediaElement.currentTime * 1000
      : graph.anchorMediaMs;
    graph.rate = graph.source.mediaElement?.playbackRate || 1;
  }

  function at(graph: Graph, outputMs: number): number {
    return Math.max(
      graph.context.currentTime,
      graph.anchorCtx + (outputMs - graph.anchorMediaMs) / 1000 / graph.rate,
    );
  }

  function clampDuration(buffer: AudioBuffer, offset: number, duration: number): number {
    return Math.max(0, Math.min(duration, buffer.duration - offset));
  }

  function stopSources(): void {
    const graph = graphRef.current;
    if (!graph) return;
    for (const source of graph.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
      source.disconnect();
    }
    graph.sources = [];
  }

  function schedule(mediaTimeMs: number): void {
    const graph = graphRef.current;
    if (!graph) return;
    stopSources();
    graph.anchorCtx = graph.context.currentTime;
    graph.anchorMediaMs = mediaTimeMs;
    graph.rate = graph.source.mediaElement?.playbackRate || 1;

    const music = input.soundtrack;
    if (graph.musicBuffer && music) {
      const { start_ms, end_ms, offset_ms } = soundtrackWindow(music);
      const clipMs = end_ms - start_ms;
      const outputEnd = offset_ms + clipMs;
      if (mediaTimeMs < outputEnd) {
        const elapsed = Math.max(0, mediaTimeMs - offset_ms);
        const source = graph.context.createBufferSource();
        source.buffer = graph.musicBuffer;
        source.playbackRate.value = graph.rate;
        source.connect(graph.musicVolume);
        const offsetS = (start_ms + elapsed) / 1000;
        source.start(
          at(graph, Math.max(offset_ms, mediaTimeMs)),
          offsetS,
          clampDuration(graph.musicBuffer, offsetS, Math.max(0, clipMs - elapsed) / 1000),
        );
        graph.sources.push(source);
      }
      scheduleFade(
        graph,
        graph.musicVolume.gain,
        linearGain(music.gain_db),
        offset_ms,
        outputEnd,
        music.fade_in_ms,
        music.fade_out_ms,
        mediaTimeMs,
      );
    }

    const voice = input.voiceTrack;
    if (graph.voiceBuffer && voice && !voice.muted) {
      const window = voiceWindow(voice);
      for (const line of voiceLineSchedule(voice)) {
        if (mediaTimeMs >= line.output_end_ms) continue;
        const elapsedOutput = Math.max(0, mediaTimeMs - line.output_start_ms);
        const elapsedSource = (elapsedOutput * line.rate) / 1000;
        const remaining = line.source_duration_s - elapsedSource;
        if (remaining <= 0) continue;
        const source = graph.context.createBufferSource();
        source.buffer = graph.voiceBuffer;
        // atempo preserves pitch; AudioBufferSource.playbackRate does not. Named deviation.
        source.playbackRate.value = line.rate * graph.rate;
        source.connect(graph.voiceGain);
        const offsetS = line.source_offset_s + elapsedSource;
        source.start(
          at(graph, Math.max(line.output_start_ms, mediaTimeMs)),
          offsetS,
          clampDuration(graph.voiceBuffer, offsetS, remaining),
        );
        graph.sources.push(source);
      }
      scheduleFade(
        graph,
        graph.voiceGain.gain,
        linearGain(voice.gain_db),
        window.start_ms,
        window.end_ms,
        voice.fade_in_ms,
        voice.fade_out_ms,
        mediaTimeMs,
      );
    }
  }

  function scheduleFade(
    graph: Graph,
    param: AudioParam,
    baseGain: number,
    startMs: number,
    endMs: number,
    fadeInMs: number,
    fadeOutMs: number,
    mediaTimeMs: number,
  ): void {
    param.cancelScheduledValues(graph.context.currentTime);
    if (mediaTimeMs >= endMs) {
      param.setValueAtTime(0, graph.context.currentTime);
      return;
    }
    const now = Math.max(mediaTimeMs, startMs);
    param.setValueAtTime(
      baseGain * fadeGainAt(now, startMs, endMs, fadeInMs, fadeOutMs),
      graph.context.currentTime,
    );
    if (fadeInMs > 0 && now < startMs + fadeInMs) {
      param.linearRampToValueAtTime(baseGain, at(graph, startMs + fadeInMs));
    }
    if (fadeOutMs > 0) {
      const outStart = endMs - fadeOutMs;
      if (now < outStart) param.setValueAtTime(baseGain, at(graph, outStart));
      param.linearRampToValueAtTime(0, at(graph, endMs));
    }
  }

  function teardown(): void {
    const graph = graphRef.current;
    if (!graph) return;
    stopSources();
    graphRef.current = null;
    try {
      graph.source.disconnect();
      graph.originalGain.disconnect();
      graph.musicVolume.disconnect();
      graph.musicDuck.disconnect();
      graph.voiceGain.disconnect();
      graph.worklet?.disconnect();
    } catch {
      // Already disconnected.
    }
  }

  return { active, error };
}
