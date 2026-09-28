import { NumberInput } from '@astryxdesign/core/NumberInput';
import { useTranslation } from 'react-i18next';
import type { EditingRecipe, FadeOptions } from '../../../../core/editing/edit-recipe';
import { PanelPair, PanelRows, PanelSection, ToggleRow } from '../../../design-system/Panel';

const DEFAULT_FADE: FadeOptions = { in_ms: 500, out_ms: 500, audio: false };

/** Video › Fade: in/out from and to black, switched on in its header. */
export function FadeSection({
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
    <PanelSection
      title={t('editFadeTitle')}
      isOn={Boolean(fade)}
      isDisabled={disabled}
      onToggle={(on) => onChange({ fade: on ? { ...DEFAULT_FADE } : undefined })}
      onReset={() => fade && onChange({ fade: { ...DEFAULT_FADE } })}
    >
      {fade && (
        <PanelRows>
          <PanelPair label={t('editFadeTimes')}>
            <NumberInput
              label={t('editFadeIn')}
              isLabelHidden
              units="s"
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
              isLabelHidden
              units="s"
              value={fade.out_ms / 1000}
              min={0}
              max={86400}
              step={0.1}
              isWheelEnabled={false}
              isDisabled={disabled}
              onChange={(seconds) => patchFade({ out_ms: Math.round(seconds * 1000) })}
            />
          </PanelPair>
          <ToggleRow
            label={t('editFadeAudio')}
            value={fade.audio}
            isDisabled={disabled}
            onChange={(audio) => patchFade({ audio })}
          />
        </PanelRows>
      )}
    </PanelSection>
  );
}
