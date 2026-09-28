import { Divider } from '@astryxdesign/core/Divider';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import type { ProcessingRecipe } from '../../../../core/processing/recipe';
import { InspectorPanelSection } from '../../../design-system/InspectorPanelSection';
import { useEditor } from '../EditorContext';
import { SoundtrackPanel } from './SoundtrackPanel';

export function AudioPanel() {
  return (
    <VStack gap={5}>
      <SourceAudioSection />
      <Divider />
      <SoundtrackPanel />
    </VStack>
  );
}

function SourceAudioSection() {
  const { t } = useTranslation();
  const editor = useEditor();
  const disabled = editor.opening || editor.busy;
  const editing = editor.processing?.editing;
  const audio = editing?.audio ?? { muted: false, gain_db: 0 };
  function update(patch: { audio?: typeof audio }) {
    const next = { ...editing, ...patch };
    const recipe: ProcessingRecipe = { ...editor.processing, editing: next };
    editor.changeProcessing(Object.keys(recipe).length > 0 ? recipe : undefined);
  }
  return (
    <InspectorPanelSection title={t('audioSourceTitle')}>
      <VStack gap={3}>
        <NumberInput
          label={t('editGain')}
          units="dB"
          width="100%"
          value={audio.gain_db}
          min={-60}
          max={24}
          step={1}
          isWheelEnabled={false}
          isDisabled={disabled || audio.muted}
          onChange={(gain_db) => update({ audio: { ...audio, gain_db } })}
        />
        <Switch
          label={t('editMute')}
          value={audio.muted}
          isDisabled={disabled}
          onChange={(muted) => update({ audio: { ...audio, muted } })}
        />
      </VStack>
    </InspectorPanelSection>
  );
}
