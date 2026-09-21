import type { LayerOrigin, TextSnapshot } from '../../subtitles/layers/document.js';
import {
  SUPPORTED_SAMPLE_RATES,
  type SynthesisInput,
  type SynthesisResult,
  type SynthesisSegment,
} from './contracts.js';
import { assertSynthesisCurrent } from './review.js';
import type { VoiceTimingLine, VoiceTimingPlan } from './timing.js';

export interface VoiceTrackArtifact {
  readonly artifact_id: string;
  readonly sha256: string;
  readonly sample_rate: number;
  readonly frames: number;
  readonly duration_ms: number;
}

export interface VoiceTrackProvenance {
  readonly engine: string;
  readonly model_id: string;
  readonly voice_id: string;
  readonly runtime: string;
  readonly request_id: string;
  readonly language: 'en' | 'vi';
}

export interface VoiceTrack {
  readonly artifact: VoiceTrackArtifact;
  readonly plan: VoiceTimingPlan;
  readonly segments: readonly SynthesisSegment[];
  readonly mode: 'replace' | 'mix';
  readonly gain_db: number;
  readonly fade_in_ms: number;
  readonly fade_out_ms: number;
  readonly muted: boolean;
  readonly origin: LayerOrigin;
  readonly provenance: VoiceTrackProvenance;
  readonly stale: boolean;
}

export interface VoiceTrackSnapshot {
  voice_track?: VoiceTrack;
}

const artifactPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const tokenPattern = /^[a-zA-Z0-9_-]{8,128}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const enginePattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    throw new Error('INVALID_VOICE_TRACK');
  return value;
}
function bounded(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error('INVALID_VOICE_TRACK');
  return value;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value || value.length > max || value.includes('\0'))
    throw new Error('INVALID_VOICE_TRACK');
  return value;
}

function parseTimingLine(value: unknown): VoiceTimingLine {
  if (
    !object(value) ||
    !exact(value, ['cue_id', 'offset_ms', 'rate', 'slot_ms', 'speech_ms', 'overrun_ms']) ||
    typeof value.cue_id !== 'string' ||
    !value.cue_id ||
    value.cue_id.length > 128
  )
    throw new Error('INVALID_VOICE_TRACK');
  return {
    cue_id: value.cue_id,
    offset_ms: integer(value.offset_ms, 0, 86400000),
    rate: bounded(value.rate, 1, Number.MAX_SAFE_INTEGER),
    slot_ms: integer(value.slot_ms, 0, 86400000),
    speech_ms: integer(value.speech_ms, 0, 600000),
    overrun_ms: integer(value.overrun_ms, 0, 600000),
  };
}

function parseSegments(value: unknown, frames: number): SynthesisSegment[] {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('INVALID_VOICE_TRACK');
  let previousEnd = 0;
  return value.map((entry) => {
    if (
      !object(entry) ||
      !exact(entry, ['cue_id', 'start_frame', 'end_frame', 'lead_silence_frames']) ||
      typeof entry.cue_id !== 'string' ||
      !entry.cue_id ||
      entry.cue_id.length > 128
    )
      throw new Error('INVALID_VOICE_TRACK');
    const lead = integer(entry.lead_silence_frames, 0, frames);
    const start = integer(entry.start_frame, 0, frames);
    const end = integer(entry.end_frame, 1, frames);
    if (start < previousEnd || start !== previousEnd + lead || end <= start)
      throw new Error('INVALID_VOICE_TRACK');
    previousEnd = end;
    return {
      cue_id: entry.cue_id,
      start_frame: start,
      end_frame: end,
      lead_silence_frames: lead,
    };
  });
}

export function parseVoiceTimingPlan(value: unknown): VoiceTimingPlan {
  if (
    !object(value) ||
    !exact(value, ['engine_targets_duration', 'lines', 'conflicts']) ||
    typeof value.engine_targets_duration !== 'boolean' ||
    !Array.isArray(value.lines) ||
    value.lines.length > 10000 ||
    !Array.isArray(value.conflicts) ||
    value.conflicts.length > 10000
  )
    throw new Error('INVALID_VOICE_TRACK');
  const lines = value.lines.map(parseTimingLine);
  const conflicts = value.conflicts.map(parseTimingLine);
  const placed = new Set(lines.map((line) => JSON.stringify(line)));
  if (conflicts.some((line) => !placed.has(JSON.stringify(line))))
    throw new Error('INVALID_VOICE_TRACK');
  return {
    engine_targets_duration: value.engine_targets_duration,
    lines,
    conflicts,
  };
}

export function parseVoiceTrack(value: unknown): VoiceTrack {
  if (
    !object(value) ||
    !exact(value, [
      'artifact',
      'plan',
      'segments',
      'mode',
      'gain_db',
      'fade_in_ms',
      'fade_out_ms',
      'muted',
      'origin',
      'provenance',
      'stale',
    ]) ||
    !object(value.artifact) ||
    !exact(value.artifact, ['artifact_id', 'sha256', 'sample_rate', 'frames', 'duration_ms']) ||
    typeof value.artifact.artifact_id !== 'string' ||
    !artifactPattern.test(value.artifact.artifact_id) ||
    typeof value.artifact.sha256 !== 'string' ||
    !hashPattern.test(value.artifact.sha256) ||
    typeof value.artifact.sample_rate !== 'number' ||
    !(SUPPORTED_SAMPLE_RATES as readonly number[]).includes(value.artifact.sample_rate) ||
    typeof value.artifact.frames !== 'number' ||
    typeof value.artifact.duration_ms !== 'number' ||
    !object(value.origin) ||
    !exact(value.origin, ['kind', 'layer', 'token']) ||
    value.origin.kind !== 'copy' ||
    value.origin.layer !== 'spoken' ||
    typeof value.origin.token !== 'string' ||
    !tokenPattern.test(value.origin.token) ||
    !object(value.provenance) ||
    !exact(value.provenance, [
      'engine',
      'model_id',
      'voice_id',
      'runtime',
      'request_id',
      'language',
    ]) ||
    typeof value.provenance.engine !== 'string' ||
    !enginePattern.test(value.provenance.engine) ||
    typeof value.provenance.model_id !== 'string' ||
    !hashPattern.test(value.provenance.model_id) ||
    typeof value.provenance.request_id !== 'string' ||
    !tokenPattern.test(value.provenance.request_id) ||
    (value.provenance.language !== 'en' && value.provenance.language !== 'vi') ||
    (value.mode !== 'replace' && value.mode !== 'mix') ||
    typeof value.stale !== 'boolean' ||
    typeof value.muted !== 'boolean'
  )
    throw new Error('INVALID_VOICE_TRACK');
  const plan = parseVoiceTimingPlan(value.plan);
  const frames = integer(value.artifact.frames, 1, 192000 * 600);
  const duration_ms = integer(value.artifact.duration_ms, 1, 600000);
  if (duration_ms !== Math.ceil((frames * 1000) / value.artifact.sample_rate))
    throw new Error('INVALID_VOICE_TRACK');
  const segments = parseSegments(value.segments, frames);
  if (segments.length !== plan.lines.length) throw new Error('INVALID_VOICE_TRACK');
  return {
    artifact: {
      artifact_id: value.artifact.artifact_id,
      sha256: value.artifact.sha256,
      sample_rate: value.artifact.sample_rate,
      frames,
      duration_ms,
    },
    plan,
    segments,
    mode: value.mode,
    gain_db: bounded(value.gain_db, -60, 24),
    fade_in_ms: integer(value.fade_in_ms, 0, 86400000),
    fade_out_ms: integer(value.fade_out_ms, 0, 86400000),
    muted: value.muted,
    origin: {
      kind: 'copy',
      layer: 'spoken',
      token: value.origin.token as string,
    },
    provenance: {
      engine: value.provenance.engine,
      model_id: value.provenance.model_id,
      voice_id: text(value.provenance.voice_id, 128),
      runtime: text(value.provenance.runtime, 256),
      request_id: value.provenance.request_id,
      language: value.provenance.language,
    },
    stale: value.stale,
  };
}

export function withVoiceTrack<T extends VoiceTrackSnapshot>(snapshot: T, track: VoiceTrack): T {
  return { ...structuredClone(snapshot), voice_track: parseVoiceTrack(track) };
}

export function withoutVoiceTrack<T extends VoiceTrackSnapshot>(snapshot: T): T {
  const next = structuredClone(snapshot);
  delete next.voice_track;
  return next;
}

export interface VoiceTrackSettings {
  readonly engine: string;
  readonly mode: 'replace' | 'mix';
  readonly gain_db: number;
  readonly fade_in_ms: number;
  readonly fade_out_ms: number;
}

// Refuses a result whose token no longer matches the document.
export function applyVoiceResult<T extends TextSnapshot & VoiceTrackSnapshot>(
  snapshot: T,
  input: SynthesisInput,
  result: SynthesisResult,
  plan: VoiceTimingPlan,
  settings: VoiceTrackSettings,
): T {
  assertSynthesisCurrent(snapshot, input);
  if (result.source_token !== input.params.source_token) throw new Error('STALE_OPERATION');
  return withVoiceTrack(snapshot, {
    artifact: {
      artifact_id: result.artifact_id,
      sha256: result.sha256,
      sample_rate: result.sample_rate,
      frames: result.frames,
      duration_ms: result.duration_ms,
    },
    plan: parseVoiceTimingPlan(plan),
    segments: structuredClone(result.segments),
    mode: settings.mode,
    gain_db: settings.gain_db,
    fade_in_ms: settings.fade_in_ms,
    fade_out_ms: settings.fade_out_ms,
    muted: false,
    origin: { kind: 'copy', layer: 'spoken', token: input.params.source_token },
    provenance: {
      engine: settings.engine,
      model_id: input.params.model_id,
      voice_id: input.params.voice_id,
      runtime: result.runtime,
      request_id: input.request_id,
      language: input.params.language,
    },
    stale: false,
  });
}
