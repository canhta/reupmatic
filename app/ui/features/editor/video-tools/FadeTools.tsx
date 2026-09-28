import { Grid } from '@astryxdesign/core/Grid';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import type { EditingRecipe, FadeOptions } from '../../../../core/editing/edit-recipe';
import type { ToggleControl } from '../ToggleControl';

const DEFAULT_FADE: FadeOptions = { in_ms: 500, out_ms: 500, audio: false };

export function FadeTools({
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
  const fade = value.fade;
  function patchFade(patch: Partial<FadeOptions>) {
    onChange({ fade: { ...(fade ?? DEFAULT_FADE), ...patch } });
  }
  return (
    <VStack gap={3}>
      <Toggle
        label={t('editFade')}
        value={Boolean(fade)}
        isDisabled={disabled}
        onChange={(enabled) => onChange({ fade: enabled ? { ...DEFAULT_FADE } : undefined })}
      />
      {fade && (
        <>
          <Grid columns={2} gap={3}>
            <NumberInput
              label={t('editFadeIn')}
              units="s"
              width="100%"
              value={fade.in_ms / 1000}
              min={0}
              max={86400}
              step={0.1}
              isWheelEnabled={false}
              isDisabled={disabled}
              onChange={(seconds) => patchFade({ in_ms: Math.round(seconds * 1000) })}
            />
            <NumberInput
              label={t('editFadeOut')}
              units="s"
              width="100%"
              value={fade.out_ms / 1000}
              min={0}
              max={86400}
              step={0.1}
              isWheelEnabled={false}
              isDisabled={disabled}
              onChange={(seconds) => patchFade({ out_ms: Math.round(seconds * 1000) })}
            />
          </Grid>
          <Toggle
            label={t('editFadeAudio')}
            value={fade.audio}
            isDisabled={disabled}
            onChange={(audio) => patchFade({ audio })}
          />
        </>
      )}
    </VStack>
  );
}
