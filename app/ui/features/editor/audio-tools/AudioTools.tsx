import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { useTranslation } from 'react-i18next';
import type { EditingRecipe } from '../../../../core/editing/edit-recipe';

export function AudioTools({
  value,
  disabled,
  onChange,
}: {
  value: EditingRecipe;
  disabled: boolean;
  onChange(patch: Partial<EditingRecipe>): void;
}) {
  const { t } = useTranslation();
  const audio = value.audio ?? { muted: false, gain_db: 0 };
  return (
    <div className="business-form">
      <div className="business-toolbar">
        <NumberInput
          label={t('editSpeed')}
          value={value.speed ?? 1}
          min={0.25}
          max={4}
          step={0.05}
          width={200}
          isWheelEnabled={false}
          isDisabled={disabled}
          onChange={(speed) => onChange({ speed })}
        />
        <NumberInput
          label={t('editGain')}
          value={audio.gain_db}
          min={-60}
          max={24}
          step={1}
          width={200}
          isWheelEnabled={false}
          isDisabled={disabled || audio.muted}
          onChange={(gain_db) => onChange({ audio: { ...audio, gain_db } })}
        />
        <CheckboxInput
          label={t('editMute')}
          value={audio.muted}
          isDisabled={disabled}
          onChange={(muted) => onChange({ audio: { ...audio, muted } })}
        />
      </div>
      <p className="field-help">{t('editAudioHint')}</p>
    </div>
  );
}
