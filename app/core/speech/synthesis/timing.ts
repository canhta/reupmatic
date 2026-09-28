import type { Cue } from '../../subtitles/cues.js';
import type { SynthesisSegment } from './contracts.js';

export interface VoiceTimingPolicy {
  readonly rate_bound: number;
  readonly acceptable_overrun_ms: number;
}

/** Fastest a voice line is sped to fit its caption; ElevenLabs' own ceiling (docs/ARCHITECTURE.md). */
export const MAX_VOICE_SPEED = 1.2;

export const SHIPPED_VOICE_TIMING_POLICY: VoiceTimingPolicy = {
  rate_bound: MAX_VOICE_SPEED,
  acceptable_overrun_ms: 0,
};

/** The edit speeds a clip between 0.25× and 4× (`EditingRecipe.speed`). */
export const MIN_EDIT_SPEED = 0.25;
export const MAX_EDIT_SPEED = 4;

export interface VoiceTimingLine {
  readonly cue_id: string;
  /** The cue start on the timeline. */
  readonly offset_ms: number;
  /** Always >= 1; 1 is the natural rate. Fitted to the output slot, `slot_ms / speed`. */
  readonly rate: number;
  /** Cue start to the next voiced cue's start (the last: its own end), on the timeline. */
  readonly slot_ms: number;
  readonly speech_ms: number;
  /** How far the line runs past its output slot at its rate, in output milliseconds. */
  readonly overrun_ms: number;
}

export interface VoiceTimingPlan {
  readonly engine_targets_duration: boolean;
  /** The edit speed the rates were fitted at; the export must play the plan at this speed. */
  readonly speed: number;
  readonly lines: readonly VoiceTimingLine[];
  readonly conflicts: readonly VoiceTimingLine[];
}

export interface VoiceTimingOptions {
  readonly cues: readonly Cue[];
  readonly segments: readonly SynthesisSegment[];
  readonly sample_rate: number;
  readonly engine_targets_duration: boolean;
  readonly policy: VoiceTimingPolicy;
  /** The edit speed the export plays the picture at: a caption's output slot is its slot / speed. */
  readonly speed: number;
}

function assertTiming(policy: VoiceTimingPolicy, speed: number): void {
  if (
    !Number.isFinite(policy.rate_bound) ||
    policy.rate_bound < 1 ||
    !Number.isFinite(policy.acceptable_overrun_ms) ||
    policy.acceptable_overrun_ms < 0 ||
    !Number.isFinite(speed) ||
    speed < MIN_EDIT_SPEED ||
    speed > MAX_EDIT_SPEED
  )
    throw new Error('VOICE_TIMING_INVALID');
}

/** A line's rate and overrun against its caption's slot in the exported file. */
function fitLine(
  speech_ms: number,
  slot_ms: number,
  speed: number,
  engine_targets_duration: boolean,
  policy: VoiceTimingPolicy,
): { rate: number; overrun_ms: number } {
  const output_ms = slot_ms / speed;
  if (engine_targets_duration)
    return { rate: 1, overrun_ms: Math.max(0, Math.floor(speech_ms - output_ms)) };
  if (speech_ms <= output_ms) return { rate: 1, overrun_ms: 0 };
  // speech / (slot / speed), multiplied out so 800 ms at 1.5x in a 1000 ms slot is exactly 1.2.
  const required = slot_ms > 0 ? (speech_ms * speed) / slot_ms : Number.POSITIVE_INFINITY;
  if (required <= policy.rate_bound) return { rate: required, overrun_ms: 0 };
  return {
    rate: policy.rate_bound,
    overrun_ms: Math.max(0, Math.floor(speech_ms / policy.rate_bound - output_ms)),
  };
}

function withConflicts(
  engine_targets_duration: boolean,
  speed: number,
  lines: VoiceTimingLine[],
  policy: VoiceTimingPolicy,
): VoiceTimingPlan {
  return {
    engine_targets_duration,
    speed,
    lines,
    conflicts: lines.filter((line) => line.overrun_ms > policy.acceptable_overrun_ms),
  };
}

export function planVoiceTiming(options: VoiceTimingOptions): VoiceTimingPlan {
  const { cues, segments, sample_rate, engine_targets_duration, policy, speed } = options;
  assertTiming(policy, speed);
  if (!Number.isFinite(sample_rate) || sample_rate <= 0 || cues.length !== segments.length)
    throw new Error('VOICE_TIMING_INVALID');
  const byCue = new Map(segments.map((segment) => [segment.cue_id, segment]));
  const lines = cues.map((cue, index) => {
    const segment = byCue.get(cue.id);
    if (!segment) throw new Error('VOICE_TIMING_INVALID');
    const speech_ms = Math.floor(((segment.end_frame - segment.start_frame) * 1000) / sample_rate);
    const slot_end_ms = index + 1 < cues.length ? cues[index + 1].start_ms : cue.end_ms;
    const slot_ms = Math.max(0, slot_end_ms - cue.start_ms);
    const fit = fitLine(speech_ms, slot_ms, speed, engine_targets_duration, policy);
    return { cue_id: cue.id, offset_ms: cue.start_ms, slot_ms, speech_ms, ...fit };
  });
  return withConflicts(engine_targets_duration, speed, lines.map(order), policy);
}

/** The same recording fitted at another edit speed: every slot rescales, so every rate is refit. */
export function refitVoiceTiming(
  plan: VoiceTimingPlan,
  speed: number,
  policy: VoiceTimingPolicy,
): VoiceTimingPlan {
  assertTiming(policy, speed);
  const lines = plan.lines.map((line) =>
    order({
      ...line,
      ...fitLine(line.speech_ms, line.slot_ms, speed, plan.engine_targets_duration, policy),
    }),
  );
  return withConflicts(plan.engine_targets_duration, speed, lines, policy);
}

/** Overrun of a line kept at its own rate on a slot an edit moved (the plan's speed unchanged). */
export function voiceLineOverrunMs(
  line: Pick<VoiceTimingLine, 'speech_ms' | 'rate'>,
  slot_ms: number,
  speed: number,
  engine_targets_duration: boolean,
): number {
  const output_ms = slot_ms / speed;
  return Math.max(
    0,
    Math.floor(
      engine_targets_duration ? line.speech_ms - output_ms : line.speech_ms / line.rate - output_ms,
    ),
  );
}

// One key order, so a refit plan compares equal to a planned one.
function order(line: VoiceTimingLine): VoiceTimingLine {
  return {
    cue_id: line.cue_id,
    offset_ms: line.offset_ms,
    rate: line.rate,
    slot_ms: line.slot_ms,
    speech_ms: line.speech_ms,
    overrun_ms: line.overrun_ms,
  };
}
