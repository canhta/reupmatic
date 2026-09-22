import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import type { EditingRecipe, FadeOptions } from '../../../../core/editing/edit-recipe';

const DEFAULT_FADE: FadeOptions = { in_ms: 500, out_ms: 500, audio: false };

export function FadeTools({
  value,
  disabled,
  onChange,
}: {
  value: EditingRecipe;
  disabled: boolean;
  onChange(patch: Partial<EditingRecipe>): void;
}) {
  const { t } = useTranslation();
  const fade = value.fade;
  function patchFade(patch: Partial<FadeOptions>) {
    onChange({ fade: { ...(fade ?? DEFAULT_FADE), ...patch } });
  }
  return (
    <VStack gap={3}>
      <CheckboxInput
        label={t('editFade')}
        value={Boolean(fade)}
        isDisabled={disabled}
        onChange={(enabled) => onChange({ fade: enabled ? { ...DEFAULT_FADE } : undefined })}
      />
      {fade && (
        <FormLayout direction="vertical">
          <NumberInput
            label={t('editFadeIn')}
            value={fade.in_ms / 1000}
            min={0}
            max={86400}
            step={0.1}
            width={180}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(seconds) => patchFade({ in_ms: Math.round(seconds * 1000) })}
          />
          <NumberInput
            label={t('editFadeOut')}
            value={fade.out_ms / 1000}
            min={0}
            max={86400}
            step={0.1}
            width={180}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(seconds) => patchFade({ out_ms: Math.round(seconds * 1000) })}
          />
          <CheckboxInput
            label={t('editFadeAudio')}
            value={fade.audio}
            isDisabled={disabled}
            onChange={(audio) => patchFade({ audio })}
          />
        </FormLayout>
      )}
      <Text as="p" type="supporting">
        {t('editFadeHint')}
      </Text>
    </VStack>
  );
}
