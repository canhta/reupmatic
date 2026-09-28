import { Grid } from '@astryxdesign/core/Grid';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import type { EditingRecipe } from '../../../../core/editing/edit-recipe';
import type { ToggleControl } from '../ToggleControl';

export function AudioTools({
  value,
  disabled,
  onChange,
  toggle: Toggle,
}: {
  value: EditingRecipe;
  disabled: boolean;
  onChange(patch: Partial<EditingRecipe>): void;
  toggle: ToggleControl;
}) {
  const { t } = useTranslation();
  const audio = value.audio ?? { muted: false, gain_db: 0 };
  return (
    <VStack gap={3}>
      <Grid columns={2} gap={3}>
        <NumberInput
          label={t('editSpeed')}
          units="×"
          width="100%"
          value={value.speed ?? 1}
          min={0.25}
          max={4}
          step={0.05}
          isWheelEnabled={false}
          isDisabled={disabled}
          onChange={(speed) => onChange({ speed })}
        />
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
          onChange={(gain_db) => onChange({ audio: { ...audio, gain_db } })}
        />
      </Grid>
      <Toggle
        label={t('editMute')}
        value={audio.muted}
        isDisabled={disabled}
        onChange={(muted) => onChange({ audio: { ...audio, muted } })}
      />
    </VStack>
  );
}
