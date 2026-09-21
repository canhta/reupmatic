import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_LOGO,
  type EditingRecipe,
  LOGO_ANCHORS,
  type LogoAnchor,
  type LogoPlacement,
} from '../../../../core/editing/edit-recipe';
import { useEditor } from '../EditorContext';

/**
 * The Edit panel's Logo section: one still image over the whole output, placed by
 * a nine-point anchor plus a margin, sized as a share of the output width, and
 * faded with opacity. The image is a Project media row (image kind); the placement
 * is recipe data, so a profile keeps the placement but never the image (D-63).
 */
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
    <div className="business-form">
      <CheckboxInput
        label={t('editLogo')}
        value={Boolean(logo)}
        isDisabled={disabled}
        onChange={(enabled) => onChange({ logo: enabled ? { ...DEFAULT_LOGO } : undefined })}
      />
      {logo && (
        <>
          <div className="business-toolbar">
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
          </div>
          <div className="business-toolbar">
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
          </div>
          <Text as="p" type="supporting">
            {t('editLogoHint')}
          </Text>
        </>
      )}
    </div>
  );
}
