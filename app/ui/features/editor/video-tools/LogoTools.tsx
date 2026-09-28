import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_LOGO,
  type EditingRecipe,
  LOGO_ANCHORS,
  type LogoPlacement,
} from '../../../../core/editing/edit-recipe';
import { PanelRows, PanelSection, SliderRow } from '../../../design-system/Panel';
import { PositionGrid } from '../../../design-system/PanelControls';
import { useEditor } from '../EditorContext';

/**
 * Video › Logo: a project image over the frame. Images come in through the native picker as
 * project media, so the image is chosen from them and Add sits in the section header.
 */
export function LogoSection({
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
    <PanelSection
      title={t('editLogoTitle')}
      isOn={Boolean(logo)}
      isDisabled={disabled}
      onToggle={(on) => onChange({ logo: on ? { ...DEFAULT_LOGO } : undefined })}
      onReset={() => logo && onChange({ logo: { ...DEFAULT_LOGO, media_id: logo.media_id } })}
      actions={
        logo && (
          <IconButton
            label={t('editLogoAddImage')}
            tooltip={t('editLogoAddImage')}
            variant="ghost"
            size="sm"
            isDisabled={disabled}
            icon={<Icon icon={Plus} size="sm" />}
            onClick={() => void editor.addLogoImage()}
          />
        )
      }
    >
      {logo && (
        <PanelRows>
          <Selector
            label={t('editLogoImage')}
            value={logo.media_id ?? ''}
            placeholder={t('editLogoImagePlaceholder')}
            isDisabled={disabled}
            options={images.map((item) => ({ value: item.id, label: item.name }))}
            emptyText={t('editLogoImageEmpty')}
            onChange={(media_id) => patchLogo({ media_id })}
          />
          <PositionGrid
            label={t('editLogoAnchor')}
            value={logo.anchor}
            isDisabled={disabled}
            cells={LOGO_ANCHORS.map((anchor) => ({
              value: anchor,
              label: t(`editLogoAnchor_${anchor}`),
            }))}
            onChange={(anchor) => patchLogo({ anchor })}
          />
          <SliderRow
            label={t('editLogoScale')}
            units="%"
            min={1}
            max={100}
            step={1}
            value={Math.round(logo.scale * 100)}
            isDisabled={disabled}
            onChange={(percent) => patchLogo({ scale: percent / 100 })}
          />
          <NumberInput
            label={t('editLogoMargin')}
            units="%"
            value={Math.round(logo.margin * 100)}
            min={0}
            max={50}
            step={1}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(percent) => patchLogo({ margin: percent / 100 })}
          />
          <SliderRow
            label={t('editLogoOpacity')}
            units="%"
            min={0}
            max={100}
            step={1}
            value={Math.round(logo.opacity * 100)}
            isDisabled={disabled}
            onChange={(percent) => patchLogo({ opacity: percent / 100 })}
          />
        </PanelRows>
      )}
    </PanelSection>
  );
}
