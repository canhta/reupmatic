// The voice as the export times it, for the review player: each line lifted out of the recording,
// sped to its planned rate at its own pitch and laid on its cue. Pure numbers, no DOM.

import { stretchTempo } from '../../editing/voice-tempo.js';
import type { SynthesisSegment } from './contracts.js';
import type { VoiceTimingPlan } from './timing.js';

export interface TimedVoiceLine {
  readonly cue_id: string;
  readonly start_frame: number;
  readonly end_frame: number;
  readonly rate: number;
  /** Where the line starts in the timed voice, on the output clock from the first line's cue. */
  readonly at_frame: number;
}

export function timedVoiceLines(
  plan: VoiceTimingPlan,
  segments: readonly SynthesisSegment[],
  sampleRate: number,
): TimedVoiceLine[] {
  const byCue = new Map(segments.map((segment) => [segment.cue_id, segment]));
  if (byCue.size !== plan.lines.length) throw new Error('VOICE_TIMING_INVALID');
  const origin = Math.min(...plan.lines.map((line) => line.offset_ms));
  return plan.lines.map((line) => {
    const segment = byCue.get(line.cue_id);
    if (!segment) throw new Error('VOICE_TIMING_INVALID');
    return {
      cue_id: line.cue_id,
      start_frame: segment.start_frame,
      end_frame: segment.end_frame,
      rate: line.rate,
      // The export plays the picture at the plan's speed, so cues arrive `speed` times sooner.
      at_frame: Math.round(((line.offset_ms - origin) * sampleRate) / 1000 / plan.speed),
    };
  });
}

/** One channel per input channel; lines that overrun into the next cue sum, as the export's amix. */
export function renderTimedVoice(
  channels: readonly Float32Array[],
  sampleRate: number,
  plan: VoiceTimingPlan,
  segments: readonly SynthesisSegment[],
): Float32Array<ArrayBuffer>[] {
  const lines = timedVoiceLines(plan, segments, sampleRate);
  return channels.map((samples) => {
    const pieces = lines.map((line) =>
      stretchTempo(samples.subarray(line.start_frame, line.end_frame), sampleRate, line.rate),
    );
    const length = Math.max(0, ...lines.map((line, index) => line.at_frame + pieces[index].length));
    const out = new Float32Array(length);
    lines.forEach((line, index) => {
      const piece = pieces[index];
      for (let frame = 0; frame < piece.length; frame += 1)
        out[line.at_frame + frame] += piece[frame];
    });
    return out;
  });
}

/** 16-bit PCM WAV, channels interleaved; samples beyond full scale clip. */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): ArrayBuffer {
  const count = channels.length,
    frames = channels[0]?.length ?? 0,
    bytes = frames * count * 2;
  const view = new DataView(new ArrayBuffer(44 + bytes));
  const text = (at: number, value: string) => {
    for (let index = 0; index < value.length; index += 1)
      view.setUint8(at + index, value.charCodeAt(index));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, bytes, true);
  let at = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (const channel of channels) {
      const value = Math.max(-1, Math.min(1, channel[frame]));
      view.setInt16(at, Math.round(value * 32767), true);
      at += 2;
    }
  }
  return view.buffer;
}
