import type { SynthesisSegment } from '../speech/synthesis/contracts.js';
import type { VoiceTrack } from '../speech/synthesis/voice-track.js';
import { RemoteError } from '../worker/remote-error.js';

export interface VoiceLine {
  offset_ms: number;
  rate: number;
  start_frame: number;
  end_frame: number;
}

export interface VoiceMix {
  artifact_id: string;
  sha256: string;
  sample_rate: number;
  mode: 'replace' | 'mix';
  gain_db: number;
  fade_in_ms: number;
  fade_out_ms: number;
  lines: VoiceLine[];
  muted: boolean;
}

/** Placement and frame spans are executed as-is; the render recomputes neither. */
export function voiceMix(track: VoiceTrack): VoiceMix {
  const segmentsByCue = new Map<string, SynthesisSegment>(
    track.segments.map((segment) => [segment.cue_id, segment]),
  );
  if (
    segmentsByCue.size !== track.segments.length ||
    track.plan.lines.length !== track.segments.length
  )
    throw new RemoteError('INVALID_VOICE');
  const lines = track.plan.lines.map((line) => {
    const segment = segmentsByCue.get(line.cue_id);
    if (!segment) throw new RemoteError('INVALID_VOICE');
    const speech_ms = Math.floor(
      ((segment.end_frame - segment.start_frame) * 1000) / track.artifact.sample_rate,
    );
    if (speech_ms !== line.speech_ms) throw new RemoteError('INVALID_VOICE');
    return {
      offset_ms: line.offset_ms,
      rate: line.rate,
      start_frame: segment.start_frame,
      end_frame: segment.end_frame,
    };
  });
  return {
    artifact_id: track.artifact.artifact_id,
    sha256: track.artifact.sha256,
    sample_rate: track.artifact.sample_rate,
    mode: track.mode,
    gain_db: track.gain_db,
    fade_in_ms: track.fade_in_ms,
    fade_out_ms: track.fade_out_ms,
    lines,
    muted: track.muted,
  };
}
