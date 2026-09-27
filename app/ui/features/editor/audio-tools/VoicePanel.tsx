import { Divider } from '@astryxdesign/core/Divider';
import { VStack } from '@astryxdesign/core/VStack';
import { SynthesisPanel } from '../../speech/synthesis/SynthesisPanel';
import { VoiceTrackPanel } from './VoiceTrackPanel';

export function VoicePanel() {
  return (
    <VStack gap={5}>
      <SynthesisPanel />
      <Divider />
      <VoiceTrackPanel />
    </VStack>
  );
}
