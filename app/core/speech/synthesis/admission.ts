import { RemoteError } from '../../worker/remote-error.js';
import type { SynthesisArtifacts } from './artifacts.js';
import type { SynthesisStatus } from './contracts.js';
import type { VoiceTrack } from './voice-track.js';

/**
 * Why a saved voice track cannot run against the currently configured synthesis model, or null
 * when it can. Each reason is its own name so the user is told exactly what to reinstall rather
 * than a generic failure: a missing model, a different model, a preset the bundle no longer
 * declares, or a content language the model no longer serves.
 */
export function voiceTrackModelProblem(track: VoiceTrack, status: SynthesisStatus): string | null {
  if (!status.available || status.model_id === null || status.engine === null)
    return 'SYNTHESIS_VOICE_MODEL_MISSING';
  if (status.model_id !== track.provenance.model_id) return 'SYNTHESIS_MODEL_CHANGED';
  if (!status.voices.some((voice) => voice.id === track.provenance.voice_id))
    return 'SYNTHESIS_VOICE_UNAVAILABLE';
  if (!status.languages.includes(track.provenance.language)) return 'MODEL_LANGUAGE_UNAVAILABLE';
  return null;
}

/**
 * The one gate between a saved project's voice track and anything that would use its audio.
 * Re-verifies the artifact through the very inspection the save dialog uses — present, nothing
 * substituted, hash matching — and refuses a stale track or an unavailable model by name. The
 * caller gets a verified WAV path; a caller-supplied filesystem path is never admitted.
 */
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
