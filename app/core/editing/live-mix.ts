// Shared with worker/media/audio/mixing.py: one ducking definition for the live
// program monitor and the FFmpeg sidechain chain. Pure numbers, no DOM.

import { type VoiceLine, voiceMix } from '../rendering/voice-mix.js';
import type { VoiceTimingPlan } from '../speech/synthesis/timing.js';
import type { VoiceTrack } from '../speech/synthesis/voice-track.js';
import { type EditingRecipe, resolveEditWindow } from './edit-recipe.js';
import type { Soundtrack } from './soundtrack.js';

export const DUCK_RATIO = 8;
export const DUCK_ATTACK_MS = 20;
export const DUCK_REFERENCE_DBFS = -18;
export const DUCK_THRESHOLD_MIN = 0.000976563;
// FFmpeg `sidechaincompress` defaults to detection=rms: it smooths the squared sample (its
// power) and takes half the log, not the peak. The worklet reads this exponent as a param.
export const DUCK_DETECTION_POWER = 2;

/** Threshold in dBFS such that a -18 dBFS key loses exactly `amountDb` at ratio 8. */
export function duckThresholdDb(amountDb: number): number {
  return DUCK_REFERENCE_DBFS - amountDb / (1 - 1 / DUCK_RATIO);
}

export function duckThreshold(amountDb: number): number {
  const threshold = 10 ** (duckThresholdDb(amountDb) / 20);
  return Math.min(1, Math.max(DUCK_THRESHOLD_MIN, threshold));
}

/** Static compressor gain reduction in dB for a key level in dBFS. */
export function duckGainReductionDb(levelDb: number, amountDb: number): number {
  const thresholdDb = duckThresholdDb(amountDb);
  if (!Number.isFinite(levelDb) || levelDb <= thresholdDb) return 0;
  return (levelDb - thresholdDb) * (1 - 1 / DUCK_RATIO);
}

/** Linear gain the music keeps while the key plays, from a key level in dBFS. */
export function duckMusicGain(levelDb: number, amountDb: number): number {
  return 10 ** (-duckGainReductionDb(levelDb, amountDb) / 20);
}

/** One-pole attack/release coefficients for an envelope follower at `sampleRate`. */
export function envelopeCoefficients(
  sampleRate: number,
  attackMs = DUCK_ATTACK_MS,
  releaseMs: number,
): { attack: number; release: number } {
  const time = (ms: number) => Math.exp(-1 / Math.max(1, (ms / 1000) * sampleRate));
  return { attack: time(attackMs), release: time(releaseMs) };
}

export interface LiveVoiceLine extends VoiceLine {
  /** Offset into the voice recording, in seconds. */
  source_offset_s: number;
  /** How much recording this line consumes, in seconds. */
  source_duration_s: number;
  /** Where the line starts on the clock its surface plays, in milliseconds. */
  output_start_ms: number;
  /** Where the line ends on the clock its surface plays, in milliseconds. */
  output_end_ms: number;
}

/**
 * The export's output clock over its source — a single video, or a composition's assembled
 * timeline: trim first, then speed, for `durationMs` of output. The live mix runs on it too, so
 * music and voice land where the export puts them.
 */
export interface OutputClock {
  readonly trimStartMs: number;
  readonly speed: number;
  /** How long the output runs; voice past it is cut. Unbounded until the source length is known. */
  readonly durationMs: number;
}

export const OUTPUT_CLOCK_UNITY: OutputClock = {
  trimStartMs: 0,
  speed: 1,
  durationMs: Number.POSITIVE_INFINITY,
};

/** The clock the live mix places music and voice on, from the edit window it previews. */
export function liveOutputClock(
  editing: EditingRecipe | undefined,
  sourceDurationMs: number,
): OutputClock {
  try {
    const window = resolveEditWindow(editing, sourceDurationMs);
    return { trimStartMs: window.start_ms, speed: window.speed, durationMs: window.duration_ms };
  } catch {
    // A half-typed trim or an unloaded source: keep the placement, bound nothing.
    return {
      trimStartMs: editing?.trim?.start_ms ?? 0,
      speed: editing?.speed ?? 1,
      durationMs: Number.POSITIVE_INFINITY,
    };
  }
}

/** The source instant the export shows at `outputMs`. */
export function outputToSourceMs(outputMs: number, clock: OutputClock): number {
  return clock.trimStartMs + outputMs * clock.speed;
}

export interface VoiceLineSpan {
  /** Where the audible part starts and ends on the output clock, in milliseconds. */
  output_start_ms: number;
  output_end_ms: number;
  /** Output milliseconds the trim start and the output end cut from the line. */
  head_ms: number;
  tail_ms: number;
}

/**
 * Where a line of `naturalMs` recording at `rate` plays in the export, or null when the trim cuts
 * all of it. Placed at `(cue − trim start) / speed`; the trim cuts audio at the edit, never moves
 * it. Mirrors `_voice_line_span` in `worker/media/audio/mixing.py`.
 */
export function voiceLineSpan(
  offsetMs: number,
  naturalMs: number,
  rate: number,
  clock: OutputClock = OUTPUT_CLOCK_UNITY,
): VoiceLineSpan | null {
  const start = Math.round((offsetMs - clock.trimStartMs) / clock.speed);
  const end = start + naturalMs / rate;
  if (end <= 0 || start >= clock.durationMs) return null;
  const head_ms = Math.max(0, -start);
  const tail_ms = Math.max(0, end - clock.durationMs);
  return { output_start_ms: start + head_ms, output_end_ms: end - tail_ms, head_ms, tail_ms };
}

/** The plan's cues whose line the export's trim cuts away entirely. */
export function voiceCuesOutsideOutput(
  plan: Pick<VoiceTimingPlan, 'lines'>,
  clock: OutputClock,
): Set<string> {
  return new Set(
    plan.lines
      .filter((line) => !voiceLineSpan(line.offset_ms, line.speech_ms, line.rate, clock))
      .map((line) => line.cue_id),
  );
}

/** Mirrors worker/media/audio/mixing.py `voice_filters`: the lines the export plays, cut to it. */
export function voiceLineSchedule(
  track: VoiceTrack,
  clock: OutputClock = OUTPUT_CLOCK_UNITY,
): LiveVoiceLine[] {
  const mix = voiceMix(track);
  const sampleRate = mix.sample_rate;
  return mix.lines.flatMap((line) => {
    const natural_s = (line.end_frame - line.start_frame) / sampleRate;
    const span = voiceLineSpan(line.offset_ms, natural_s * 1000, line.rate, clock);
    if (!span) return [];
    return [
      {
        ...line,
        source_offset_s: line.start_frame / sampleRate + (span.head_ms * line.rate) / 1000,
        source_duration_s: natural_s - ((span.head_ms + span.tail_ms) * line.rate) / 1000,
        output_start_ms: span.output_start_ms,
        output_end_ms: span.output_end_ms,
      },
    ];
  });
}

export function voiceWindow(
  track: VoiceTrack,
  clock: OutputClock = OUTPUT_CLOCK_UNITY,
): { start_ms: number; end_ms: number } {
  const lines = voiceLineSchedule(track, clock);
  if (!lines.length) return { start_ms: 0, end_ms: 0 };
  return {
    start_ms: Math.min(...lines.map((line) => line.output_start_ms)),
    end_ms: Math.max(...lines.map((line) => line.output_end_ms)),
  };
}

export function soundtrackWindow(track: Soundtrack): {
  start_ms: number;
  end_ms: number;
  offset_ms: number;
} {
  return {
    start_ms: track.start_ms,
    end_ms: track.end_ms,
    offset_ms: track.offset_ms,
  };
}

/** Where the music lane sits on the timeline its clock maps from: at 1× from its output offset. */
export function soundtrackSourceSpan(
  track: Soundtrack,
  clock: OutputClock,
): { start_ms: number; end_ms: number } {
  return {
    start_ms: outputToSourceMs(track.offset_ms, clock),
    end_ms: outputToSourceMs(track.offset_ms + track.end_ms - track.start_ms, clock),
  };
}

/** Linear afade in/out on `[startMs, endMs)`, matching FFmpeg's `afade=t=tri`. */
export function fadeGainAt(
  positionMs: number,
  startMs: number,
  endMs: number,
  fadeInMs: number,
  fadeOutMs: number,
): number {
  let gain = 1;
  if (fadeInMs > 0 && positionMs < startMs + fadeInMs) {
    gain *= Math.max(0, Math.min(1, (positionMs - startMs) / fadeInMs));
  }
  if (fadeOutMs > 0 && positionMs > endMs - fadeOutMs) {
    gain *= Math.max(0, Math.min(1, (endMs - positionMs) / fadeOutMs));
  }
  return gain;
}

export function linearGain(db: number): number {
  return 10 ** (db / 20);
}

/**
 * The output time the live mix schedules on: where the timeline's frame lands in the export —
 * negative before the trim start. A single video's timeline is its element's source time; a
 * composition's is its own gapless clock, not the playing clip's source time.
 */
export function liveMixClockMs(
  composed: boolean,
  elementTimeMs: number,
  timelineMs: number,
  clock: OutputClock,
): number {
  return ((composed ? timelineMs : elementTimeMs) - clock.trimStartMs) / clock.speed;
}

/** The rate the monitor plays a source at: a composition clip's own speed under the edit's. */
export function previewElementRate(clipSpeed: number, editSpeed: number): number {
  // Rounded so 1.2 × 1.5 plays at 1.8.
  return Math.round(clipSpeed * editSpeed * 1e6) / 1e6;
}

export interface LiveClipPlay {
  /** Names the stretched copy: the clip at this tempo. */
  key: string;
  /** Recording seconds per AudioContext second; 1 plays the recording itself. */
  tempo: number;
  /** Where to start: in the recording at tempo 1, otherwise in the stretched copy. */
  offset_s: number;
  duration_s: number;
}

/**
 * How the monitor plays a clip `elapsed_s` output seconds in, with `remaining_s` to go, on a clock
 * running `clockRate`×. Web Audio's `playbackRate` shifts pitch, so the clip's own rate and the
 * clock's fold into one pitch-kept stretch that plays at 1×.
 */
export function liveClipPlay(
  clip: { id: string; source_offset_s: number; rate: number },
  clockRate: number,
  elapsed_s: number,
  remaining_s: number,
): LiveClipPlay {
  // Rounded so 1.2 × 1.5 names the same copy as 1.8.
  const tempo = Math.round(clip.rate * clockRate * 1e6) / 1e6;
  return {
    key: `${clip.id}@${tempo}`,
    tempo,
    offset_s: (tempo === 1 ? clip.source_offset_s : 0) + elapsed_s / clockRate,
    duration_s: remaining_s / clockRate,
  };
}

/** Stretched clips for one playback rate at a time: a new rate drops the old copies. */
export function stretchCache<T>(): (clockRate: number, key: string, make: () => T) => T {
  let rate = Number.NaN;
  const entries = new Map<string, T>();
  return (clockRate, key, make) => {
    if (clockRate !== rate) {
      entries.clear();
      rate = clockRate;
    }
    let entry = entries.get(key);
    if (entry === undefined) {
      entry = make();
      entries.set(key, entry);
    }
    return entry;
  };
}

/**
 * Output-clock milliseconds per AudioContext millisecond: a composition, whose clips play at
 * `previewElementRate`, advances at 1×, and so does a single video playing at its speed.
 */
export function liveMixClockRate(
  composed: boolean,
  elementRate: number,
  clock: OutputClock,
): number {
  return composed ? 1 : Math.round((elementRate / clock.speed) * 1e6) / 1e6;
}

/**
 * Which live bus the ducking envelope listens to. Mirrors `audio_filter_graph`:
 * the voice when it is present, otherwise the original audio unless the original
 * is muted or a `replace` lane already removed it.
 */
export function duckKey(
  voice: VoiceTrack | undefined,
  track: Soundtrack | undefined,
  editing: EditingRecipe | undefined,
  hasSource: boolean,
): 'voice' | 'original' | null {
  if (!track || track.muted) return null;
  if (!track.duck.enabled || track.duck.amount_db <= 0) return null;
  const voiceActive = voice && !voice.muted ? voice : undefined;
  if (voiceActive) return 'voice';
  // A muted or absent voice never suppresses the original.
  const original = hasSource && !(editing?.audio?.muted ?? false);
  return original && track.mode !== 'replace' ? 'original' : null;
}

/** The worklet's parameter set for one soundtrack ducking amount. */
export function duckWorkletParams(
  amountDb: number,
  releaseMs: number,
  sampleRate: number,
): {
  thresholdDb: number;
  amountDb: number;
  ratio: number;
  attack: number;
  release: number;
  power: number;
} {
  const { attack, release } = envelopeCoefficients(sampleRate, DUCK_ATTACK_MS, releaseMs);
  return {
    thresholdDb: duckThresholdDb(amountDb),
    amountDb,
    ratio: DUCK_RATIO,
    attack,
    release,
    power: DUCK_DETECTION_POWER,
  };
}
