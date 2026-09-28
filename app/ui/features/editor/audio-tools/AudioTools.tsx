import { useTranslation } from 'react-i18next';
import type { EditingRecipe } from '../../../../core/editing/edit-recipe';
import { PanelRows, PanelSection, SliderRow, ToggleRow } from '../../../design-system/Panel';

const NO_GAIN = { muted: false, gain_db: 0 };

/** Audio › Original: the source's own sound, its level and mute. */
export function OriginalSection({
  value,
  disabled,
  onChange,
}: {
  value: EditingRecipe;
  disabled: boolean;
  onChange(patch: Partial<EditingRecipe>): void;
}) {
  const { t } = useTranslation();
  const audio = value.audio ?? NO_GAIN;
  return (
    <PanelSection
      title={t('audioSourceTitle')}
      isDisabled={disabled}
      onReset={() => onChange({ audio: { ...NO_GAIN } })}
    >
      <PanelRows>
        <SliderRow
          label={t('editGain')}
          units="dB"
          min={-60}
          max={24}
          step={1}
          value={audio.gain_db}
          isDisabled={disabled || audio.muted}
          onChange={(gain_db) => onChange({ audio: { ...audio, gain_db } })}
        />
        <ToggleRow
          label={t('editMute')}
          value={audio.muted}
          isDisabled={disabled}
          onChange={(muted) => onChange({ audio: { ...audio, muted } })}
        />
      </PanelRows>
    </PanelSection>
  );
}
