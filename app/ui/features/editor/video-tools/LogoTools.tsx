import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { HStack } from '@astryxdesign/core/HStack';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_LOGO,
  type EditingRecipe,
  LOGO_ANCHORS,
  type LogoAnchor,
  type LogoPlacement,
} from '../../../../core/editing/edit-recipe';
import { useEditor } from '../EditorContext';

export function LogoTools({
  value,
  disabled,
  onChange,
}: {
  value: EditingRecipe;
  disabled: boolean;
  onChange(patch: Partial<EditingRecipe>): void;
}) {
  const { t } = useTranslation();
  const editor = useEditor();
  const logo = value.logo;
  const images = editor.projectMedia.filter((item) => item.kind === 'image');

  function patchLogo(patch: Partial<LogoPlacement>) {
    if (!logo) return;
    onChange({ logo: { ...logo, ...patch } });
  }

  return (
    <VStack gap={3}>
      <CheckboxInput
        label={t('editLogo')}
        value={Boolean(logo)}
        isDisabled={disabled}
        onChange={(enabled) => onChange({ logo: enabled ? { ...DEFAULT_LOGO } : undefined })}
      />
      {logo && (
        <>
          <HStack gap={2} vAlign="end" wrap="wrap">
            <Selector
              label={t('editLogoImage')}
              value={logo.media_id ?? ''}
              placeholder={t('editLogoImagePlaceholder')}
              isDisabled={disabled}
              options={images.map((item) => ({ value: item.id, label: item.name }))}
              emptyText={t('editLogoImageEmpty')}
              onChange={(media_id) => patchLogo({ media_id })}
            />
            <Button
              label={t('editLogoAddImage')}
              size="sm"
              isDisabled={disabled}
              onClick={() => void editor.addLogoImage()}
            />
          </HStack>
          <FormLayout direction="vertical">
            <Selector
              label={t('editLogoAnchor')}
              value={logo.anchor}
              isDisabled={disabled}
              options={LOGO_ANCHORS.map((anchor) => ({
                value: anchor,
                label: t(`editLogoAnchor_${anchor}`),
              }))}
              onChange={(anchor) => patchLogo({ anchor: anchor as LogoAnchor })}
            />
            <NumberInput
              label={t('editLogoScale')}
              value={Math.round(logo.scale * 100)}
              min={1}
              max={100}
              step={1}
              width={160}
              isWheelEnabled={false}
              isDisabled={disabled}
              onChange={(percent) => patchLogo({ scale: percent / 100 })}
            />
            <NumberInput
              label={t('editLogoMargin')}
              value={Math.round(logo.margin * 100)}
              min={0}
              max={50}
              step={1}
              width={160}
              isWheelEnabled={false}
              isDisabled={disabled}
              onChange={(percent) => patchLogo({ margin: percent / 100 })}
            />
            <NumberInput
              label={t('editLogoOpacity')}
              value={Math.round(logo.opacity * 100)}
              min={0}
              max={100}
              step={1}
              width={160}
              isWheelEnabled={false}
              isDisabled={disabled}
              onChange={(percent) => patchLogo({ opacity: percent / 100 })}
            />
          </FormLayout>
          <Text as="p" type="supporting">
            {t('editLogoHint')}
          </Text>
        </>
      )}
    </VStack>
  );
}
