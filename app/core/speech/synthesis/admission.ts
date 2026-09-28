import { RemoteError } from '../../worker/remote-error.js';
import type { SynthesisArtifacts } from './artifacts.js';
import type { VoiceTrack } from './voice-track.js';

// A finished artifact is admitted by its own hash and receipt. The installed model, its presets
// and the recorded language are not part of the audio's identity, so a cloud or cloned track, a
// muted track, or a local track after a model swap all still export.
export async function verifyVoiceTrack(
  track: VoiceTrack,
  artifacts: SynthesisArtifacts,
): Promise<string> {
  if (track.stale) throw new RemoteError('VOICE_TRACK_STALE');
  return artifacts.verifyReference(track.artifact);
}
