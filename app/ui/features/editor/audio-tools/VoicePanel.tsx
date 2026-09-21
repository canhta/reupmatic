import { SynthesisPanel } from '../../speech/synthesis/SynthesisPanel';
import { VoiceTrackPanel } from './VoiceTrackPanel';

/**
 * The Voice tool panel: generate narration from the spoken text, review its
 * timing, then tune the applied voice track's mix. These lived in the old
 * Audio tab; the D-63 split gives TTS its own rail item.
 */
export function VoicePanel() {
  return (
    <>
      <SynthesisPanel />
      <VoiceTrackPanel />
    </>
  );
}
