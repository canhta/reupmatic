import { RemoteError } from '../../worker/remote-error.js';
import type { SynthesisArtifacts } from './artifacts.js';
import type { SynthesisStatus } from './contracts.js';
import type { VoiceTrack } from './voice-track.js';

export function voiceTrackModelProblem(track: VoiceTrack, status: SynthesisStatus): string | null {
  if (!status.available || status.model_id === null || status.engine === null)
    return 'SYNTHESIS_VOICE_MODEL_MISSING';
  if (status.model_id !== track.provenance.model_id) return 'SYNTHESIS_MODEL_CHANGED';
  if (!status.voices.some((voice) => voice.id === track.provenance.voice_id))
    return 'SYNTHESIS_VOICE_UNAVAILABLE';
  if (!status.languages.includes(track.provenance.language)) return 'MODEL_LANGUAGE_UNAVAILABLE';
  return null;
}

// Re-verifies through the save-dialog inspection; a caller-supplied filesystem path is never admitted.
export async function verifyVoiceTrack(
  track: VoiceTrack,
  artifacts: SynthesisArtifacts,
  status: SynthesisStatus,
): Promise<string> {
  if (track.stale) throw new RemoteError('VOICE_TRACK_STALE');
  const problem = voiceTrackModelProblem(track, status);
  if (problem) throw new RemoteError(problem);
  return artifacts.verifyReference(track.artifact);
}
