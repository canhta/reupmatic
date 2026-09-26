// Shared with worker/media/audio/mixing.py: one ducking definition for the live
// program monitor and the FFmpeg sidechain chain. Pure numbers, no DOM.

import { type VoiceLine, voiceMix } from '../rendering/voice-mix.js';
import type { VoiceTrack } from '../speech/synthesis/voice-track.js';
import type { EditingRecipe } from './edit-recipe.js';
import type { Soundtrack } from './soundtrack.js';

export const DUCK_RATIO = 8;
export const DUCK_ATTACK_MS = 20;
export const DUCK_REFERENCE_DBFS = -18;
export const DUCK_THRESHOLD_MIN = 0.000976563;

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
  /** Where the line starts on the output clock, in milliseconds. */
  output_start_ms: number;
  /** Where the line ends on the output clock, in milliseconds. */
  output_end_ms: number;
}

/** Mirrors worker/media/audio/mixing.py `voice_filters` line placement. */
export function voiceLineSchedule(track: VoiceTrack): LiveVoiceLine[] {
  const mix = voiceMix(track);
  const sampleRate = mix.sample_rate;
  return mix.lines.map((line) => {
    const source_offset_s = line.start_frame / sampleRate;
    const source_duration_s = (line.end_frame - line.start_frame) / sampleRate;
    return {
      ...line,
      source_offset_s,
      source_duration_s,
      output_start_ms: line.offset_ms,
      output_end_ms: line.offset_ms + (source_duration_s * 1000) / line.rate,
    };
  });
}

export function voiceWindow(track: VoiceTrack): { start_ms: number; end_ms: number } {
  const lines = voiceLineSchedule(track);
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
} {
  const { attack, release } = envelopeCoefficients(sampleRate, DUCK_ATTACK_MS, releaseMs);
  return {
    thresholdDb: duckThresholdDb(amountDb),
    amountDb,
    ratio: DUCK_RATIO,
    attack,
    release,
  };
}
