import type { Cue } from '../../subtitles/cues.js';
import type { SynthesisSegment } from './contracts.js';

export interface VoiceTimingPolicy {
  readonly rate_bound: number;
  readonly acceptable_overrun_ms: number;
}

export const SHIPPED_VOICE_TIMING_POLICY: VoiceTimingPolicy = {
  rate_bound: 1,
  acceptable_overrun_ms: 0,
};

export interface VoiceTimingLine {
  readonly cue_id: string;
  readonly offset_ms: number;
  /** Always >= 1; 1 is the natural rate. */
  readonly rate: number;
  readonly slot_ms: number;
  readonly speech_ms: number;
  readonly overrun_ms: number;
}

export interface VoiceTimingPlan {
  readonly engine_targets_duration: boolean;
  readonly lines: readonly VoiceTimingLine[];
  readonly conflicts: readonly VoiceTimingLine[];
}

export interface VoiceTimingOptions {
  readonly cues: readonly Cue[];
  readonly segments: readonly SynthesisSegment[];
  readonly sample_rate: number;
  readonly engine_targets_duration: boolean;
  readonly policy: VoiceTimingPolicy;
}

export function planVoiceTiming(options: VoiceTimingOptions): VoiceTimingPlan {
  const { cues, segments, sample_rate, engine_targets_duration, policy } = options;
  if (
    !Number.isFinite(sample_rate) ||
    sample_rate <= 0 ||
    !Number.isFinite(policy.rate_bound) ||
    policy.rate_bound < 1 ||
    !Number.isFinite(policy.acceptable_overrun_ms) ||
    policy.acceptable_overrun_ms < 0 ||
    cues.length !== segments.length
  )
    throw new Error('VOICE_TIMING_INVALID');
  const byCue = new Map(segments.map((segment) => [segment.cue_id, segment]));
  const lines = cues.map((cue, index) => {
    const segment = byCue.get(cue.id);
    if (!segment) throw new Error('VOICE_TIMING_INVALID');
    const speech_ms = Math.floor(((segment.end_frame - segment.start_frame) * 1000) / sample_rate);
    const slot_end_ms = index + 1 < cues.length ? cues[index + 1].start_ms : cue.end_ms;
    const slot_ms = Math.max(0, slot_end_ms - cue.start_ms);
    let rate = 1;
    let overrun_ms = 0;
    if (engine_targets_duration) {
      overrun_ms = Math.max(0, speech_ms - slot_ms);
    } else if (speech_ms > slot_ms) {
      const required = slot_ms > 0 ? speech_ms / slot_ms : Number.POSITIVE_INFINITY;
      if (required <= policy.rate_bound) {
        rate = required;
      } else {
        rate = policy.rate_bound;
        overrun_ms = Math.max(0, Math.floor(speech_ms / rate - slot_ms));
      }
    }
    return { cue_id: cue.id, offset_ms: cue.start_ms, rate, slot_ms, speech_ms, overrun_ms };
  });
  return {
    engine_targets_duration,
    lines,
    conflicts: lines.filter((line) => line.overrun_ms > policy.acceptable_overrun_ms),
  };
}
