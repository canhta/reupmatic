import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { useTranslation } from 'react-i18next';
import type { ProcessingRecipe } from '../../../../core/processing/recipe';
import { InspectorPanelSection } from '../../../design-system/InspectorPanelSection';
import { useEditor } from '../EditorContext';
import { SoundtrackPanel } from './SoundtrackPanel';

export function AudioPanel() {
  return (
    <>
      <SourceAudioSection />
      <SoundtrackPanel />
    </>
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
      <div className="business-toolbar">
        <NumberInput
          label={t('editGain')}
          value={audio.gain_db}
          min={-60}
          max={24}
          step={1}
          width={180}
          isWheelEnabled={false}
          isDisabled={disabled || audio.muted}
          onChange={(gain_db) => update({ audio: { ...audio, gain_db } })}
        />
        <CheckboxInput
          label={t('editMute')}
          value={audio.muted}
          isDisabled={disabled}
          onChange={(muted) => update({ audio: { ...audio, muted } })}
        />
      </div>
    </InspectorPanelSection>
  );
}
