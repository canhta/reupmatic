import type { Cue } from '../../subtitles/cues.js';
import type { SynthesisSegment } from './contracts.js';

/**
 * The policy bounds the plan reads. They are parameters, never defaults: no real model weights
 * have been measured in this build, so the caller supplies the bounds this build ships — see
 * `SHIPPED_VOICE_TIMING_POLICY` — until ticket 07 sets them from measurement.
 */
export interface VoiceTimingPolicy {
  /** Compression bound: the largest rate factor a line's speech may be sped up to. `1` is unity —
   *  no compression — so a line that cannot fit at `1` is reported instead of squeezed. */
  readonly rate_bound: number;
  /** Acceptable overrun, which is also the conflict threshold: how far, in milliseconds, a line's
   *  placed speech may still run past its slot and remain placed rather than reported. `0` reports
   *  any residual overrun. */
  readonly acceptable_overrun_ms: number;
}

/**
 * The bounds this build ships, and the one place placement policy may be written down: a unity
 * compression bound (`1`, no compression) and no tolerated overrun (`0`, every residual overrun is
 * reported). Unity is deliberate, not a guess — no real model weights have been measured here, so
 * ticket 07 sets the bound from evidence, and raising it is this one value with no code change.
 * Consumers read these rather than carrying their own literal: the review screen plans with them
 * and a composition edit re-judges conflicts by them. They stay parameters to `planVoiceTiming`,
 * never silent defaults, and the mechanism is exercised at raised bounds by tests that pass them
 * in explicitly.
 */
export const SHIPPED_VOICE_TIMING_POLICY: VoiceTimingPolicy = {
  rate_bound: 1,
  acceptable_overrun_ms: 0,
};

export interface VoiceTimingLine {
  readonly cue_id: string;
  /** Where this line's audio starts on the composition clock: always its cue's start. */
  readonly offset_ms: number;
  /** The rate factor placed speech is played at, always `>= 1`. `1` is the natural rate. */
  readonly rate: number;
  /** From this line's anchor to the next line's anchor, so the silence between lines is usable.
   *  The last line has no next line, so its slot ends at its own cue end. */
  readonly slot_ms: number;
  /** The line's measured speech extent, in whole milliseconds on the composition clock. The
   *  silence the producer inserted before it is reported separately as `lead_silence_frames`, so
   *  it is not counted here. */
  readonly speech_ms: number;
  /** Placed speech still past the slot after the rate factor is applied; `0` when it fits. */
  readonly overrun_ms: number;
}

export interface VoiceTimingPlan {
  /** Which engine behaviour produced this job's audio: `true` means the engine owns the fit and
   *  every rate factor is unity; `false` means the host placed the speech at a host-side rate. */
  readonly engine_targets_duration: boolean;
  readonly lines: readonly VoiceTimingLine[];
  /** The subset of `lines` that overrun past the tolerated bound, carrying their own identity,
   *  slot, speech and overrun. One conflict never fails the rest of the plan. */
  readonly conflicts: readonly VoiceTimingLine[];
}

export interface VoiceTimingOptions {
  /** The cues as captured in the synthesis request, in document order. */
  readonly cues: readonly Cue[];
  /** The segment spans the synthesis result reports, one per cue in the same order. */
  readonly segments: readonly SynthesisSegment[];
  /** The rate the produced recording reports, used to measure speech in time rather than frames. */
  readonly sample_rate: number;
  readonly engine_targets_duration: boolean;
  readonly policy: VoiceTimingPolicy;
}

/**
 * The one place voice placement policy lives. Pure: no file, process, UI or Electron access. It
 * anchors every line to its cue's start, never pushes a line later, never slows speech, borrows
 * the silence before the next line, compresses a line that exceeds its slot only up to the bound,
 * and reports a line that still collides as a conflict while leaving the rest of the plan intact.
 */
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
    // The plan places against the composition clock, which is whole milliseconds: `Cue.start_ms`
    // and `end_ms` are integers and `offset_ms`/`slot_ms` are read straight off them. A frame span
    // is not an exact number of milliseconds, so the measured extent is quantised down onto that
    // same clock before it is compared with a slot. A residual below one clock tick cannot be
    // expressed as a placement, so it is a rounding artefact rather than a conflict. Floor cannot
    // hide a real overrun: when the true extent is at least one millisecond past the integer slot,
    // its floor is too — a whole-millisecond quotient of integer frames is representable exactly —
    // so a genuine conflict is still reported. `rate` stays a real ratio, never a clock quantity.
    const speech_ms = Math.floor(((segment.end_frame - segment.start_frame) * 1000) / sample_rate);
    const slot_end_ms = index + 1 < cues.length ? cues[index + 1].start_ms : cue.end_ms;
    // A degenerate input where the next cue starts before this one leaves no slot rather than a
    // negative one; the line then cannot fit and is reported, never shifted.
    const slot_ms = Math.max(0, slot_end_ms - cue.start_ms);
    let rate = 1;
    let overrun_ms = 0;
    if (engine_targets_duration) {
      // The engine owns the fit, so the plan applies no rate factor. A line that still overruns is
      // reported as it stands rather than squeezed host-side.
      overrun_ms = Math.max(0, speech_ms - slot_ms);
    } else if (speech_ms > slot_ms) {
      const required = slot_ms > 0 ? speech_ms / slot_ms : Number.POSITIVE_INFINITY;
      if (required <= policy.rate_bound) {
        rate = required;
      } else {
        rate = policy.rate_bound;
        // The residual after the rate factor lands on the same clock as everything else: the
        // sub-millisecond remainder is not placement, so it is dropped here too.
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
