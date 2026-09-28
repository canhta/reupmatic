import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { ToggleButton, ToggleButtonGroup } from '@astryxdesign/core/ToggleButton';
import { Bold, CaseUpper, Italic } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fontFamilies } from '../../../../core/subtitles/fonts';
import {
  ANIMATION_EMPHASIS_PRESETS,
  ANIMATION_IN_PRESETS,
  ANIMATION_OUT_PRESETS,
  type CoverBand,
  defaultCoverBand,
  defaultSubtitleAnimation,
  defaultSubtitleStyle,
  type SubtitleStyle,
  subtitleStyleFieldInvalid,
} from '../../../../core/subtitles/style';
import {
  PanelPair,
  PanelRow,
  PanelRows,
  PanelSection,
  PanelSections,
  SliderRow,
} from '../../../design-system/Panel';
import { ColorRow, PositionGrid } from '../../../design-system/PanelControls';

interface Props {
  value: SubtitleStyle;
  disabled: boolean;
  onChange(value: SubtitleStyle): void;
  onFitCover?: (current: SubtitleStyle) => { style: SubtitleStyle; others: number[] } | null;
}

/** The box shown when Background is switched on from none. */
const BACKGROUND_ON_OPACITY = 0.6;
const POSITIONS = [7, 8, 9, 4, 5, 6, 1, 2, 3];
const FONT_FIELDS = [
  'font_family',
  'font_size_pct',
  'bold',
  'italic',
  'uppercase',
  'text_color',
  'outline_color',
  'outline_pct',
  'shadow_pct',
  'spacing_pct',
] as const;
const POSITION_FIELDS = ['position', 'margin_x_pct', 'margin_y_pct'] as const;

function pick<Key extends keyof SubtitleStyle>(keys: readonly Key[]): Pick<SubtitleStyle, Key> {
  return Object.fromEntries(keys.map((key) => [key, defaultSubtitleStyle[key]])) as Pick<
    SubtitleStyle,
    Key
  >;
}

export function SubtitleStyleFields({ value, disabled, onChange, onFitCover }: Props) {
  const { t } = useTranslation();
  const [otherPositions, setOtherPositions] = useState<number[] | null>(null);
  const animation = value.animation;
  const animated =
    animation.in.preset !== 'none' ||
    animation.out.preset !== 'none' ||
    animation.emphasis.preset !== 'none';
  const invalid = (key: keyof SubtitleStyle) =>
    subtitleStyleFieldInvalid(key, value[key])
      ? { type: 'error' as const, message: t('styleNumberInvalid') }
      : undefined;
  const cover = value.cover;
  const patchCover = (patch: Partial<CoverBand>) =>
    cover && onChange({ ...value, cover: { ...cover, ...patch } });

  return (
    <PanelSections>
      <PanelSection
        title={t('styleFont')}
        isDisabled={disabled}
        onReset={() => onChange({ ...value, ...pick(FONT_FIELDS) })}
      >
        <PanelRows>
          <Selector
            label={t('styleFontFamily')}
            value={value.font_family}
            isDisabled={disabled}
            hasSearch={fontFamilies.length > 10}
            options={fontFamilies.map((family) => ({ value: family, label: family }))}
            onChange={(font_family) => onChange({ ...value, font_family })}
          />
          <SliderRow
            label={t('style_font_size_pct')}
            units="%"
            min={1}
            max={15}
            step={0.25}
            value={Number(value.font_size_pct)}
            isDisabled={disabled}
            onChange={(font_size_pct) => onChange({ ...value, font_size_pct })}
          />
          <PanelRow label={t('styleFormat')}>
            <ToggleButtonGroup
              label={t('styleFormat')}
              type="multiple"
              size="sm"
              value={(['bold', 'italic', 'uppercase'] as const).filter((key) => value[key])}
              isDisabled={disabled}
              onChange={(next) => {
                const on = Array.isArray(next) ? next : [];
                onChange({
                  ...value,
                  bold: on.includes('bold'),
                  italic: on.includes('italic'),
                  uppercase: on.includes('uppercase'),
                });
              }}
            >
              <ToggleButton
                value="bold"
                label={t('styleBold')}
                isIconOnly
                icon={<Icon icon={Bold} size="sm" />}
              />
              <ToggleButton
                value="italic"
                label={t('styleItalic')}
                isIconOnly
                icon={<Icon icon={Italic} size="sm" />}
              />
              <ToggleButton
                value="uppercase"
                label={t('styleUppercase')}
                isIconOnly
                icon={<Icon icon={CaseUpper} size="sm" />}
              />
            </ToggleButtonGroup>
          </PanelRow>
          <ColorRow
            label={t('style_text_color')}
            value={value.text_color}
            isInvalid={subtitleStyleFieldInvalid('text_color', value.text_color)}
            isDisabled={disabled}
            onChange={(text_color) => onChange({ ...value, text_color })}
          />
          <ColorRow
            label={t('style_outline_color')}
            value={value.outline_color}
            isInvalid={subtitleStyleFieldInvalid('outline_color', value.outline_color)}
            isDisabled={disabled}
            onChange={(outline_color) => onChange({ ...value, outline_color })}
          />
          <SliderRow
            label={t('style_outline_pct')}
            units="×"
            min={0}
            max={2}
            step={0.05}
            value={Number(value.outline_pct)}
            isDisabled={disabled}
            onChange={(outline_pct) => onChange({ ...value, outline_pct })}
          />
          <SliderRow
            label={t('style_shadow_pct')}
            units="×"
            min={0}
            max={2}
            step={0.05}
            value={Number(value.shadow_pct)}
            isDisabled={disabled}
            onChange={(shadow_pct) => onChange({ ...value, shadow_pct })}
          />
          <NumberInput
            label={t('style_spacing_pct')}
            units="×"
            min={-0.2}
            max={2}
            step={0.05}
            value={Number(value.spacing_pct)}
            status={invalid('spacing_pct')}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(spacing_pct) => onChange({ ...value, spacing_pct })}
          />
        </PanelRows>
      </PanelSection>
      <PanelSection
        title={t('stylePosition')}
        isDisabled={disabled}
        onReset={() => onChange({ ...value, ...pick(POSITION_FIELDS) })}
      >
        <PanelRows>
          <PositionGrid
            label={t('stylePlace')}
            value={Number(value.position)}
            isDisabled={disabled}
            cells={POSITIONS.map((position) => ({
              value: position,
              label: t(`stylePosition_${position}`),
            }))}
            onChange={(position) => onChange({ ...value, position })}
          />
          <NumberInput
            label={t('style_margin_x_pct')}
            units="%"
            min={0}
            max={40}
            step={1}
            value={Number(value.margin_x_pct)}
            status={invalid('margin_x_pct')}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(margin_x_pct) => onChange({ ...value, margin_x_pct })}
          />
          <NumberInput
            label={t('style_margin_y_pct')}
            units="%"
            min={0}
            max={40}
            step={1}
            value={Number(value.margin_y_pct)}
            status={invalid('margin_y_pct')}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(margin_y_pct) => onChange({ ...value, margin_y_pct })}
          />
        </PanelRows>
      </PanelSection>
      <PanelSection
        title={t('styleBackground')}
        isOn={value.box_opacity > 0}
        isDisabled={disabled}
        onToggle={(on) =>
          onChange({
            ...value,
            box_opacity: on ? BACKGROUND_ON_OPACITY : 0,
          })
        }
        onReset={() =>
          onChange({
            ...value,
            box_color: defaultSubtitleStyle.box_color,
            box_opacity: value.box_opacity > 0 ? BACKGROUND_ON_OPACITY : 0,
            box_padding_pct: defaultSubtitleStyle.box_padding_pct,
          })
        }
      >
        <PanelRows>
          <ColorRow
            label={t('style_box_color')}
            value={value.box_color}
            isInvalid={subtitleStyleFieldInvalid('box_color', value.box_color)}
            isDisabled={disabled}
            onChange={(box_color) => onChange({ ...value, box_color })}
          />
          <SliderRow
            label={t('style_box_opacity')}
            units="%"
            min={0}
            max={100}
            step={5}
            value={Math.round(value.box_opacity * 100)}
            isDisabled={disabled}
            onChange={(percent) => onChange({ ...value, box_opacity: percent / 100 })}
          />
          <SliderRow
            label={t('style_box_padding_pct')}
            units="×"
            min={0}
            max={4}
            step={0.05}
            value={Number(value.box_padding_pct)}
            isDisabled={disabled}
            onChange={(box_padding_pct) => onChange({ ...value, box_padding_pct })}
          />
        </PanelRows>
      </PanelSection>
      <PanelSection
        title={t('styleCover')}
        isOn={cover !== null}
        isDisabled={disabled}
        onToggle={(on) => onChange({ ...value, cover: on ? defaultCoverBand(value) : null })}
        onReset={() => cover && onChange({ ...value, cover: defaultCoverBand(value) })}
      >
        {cover && (
          <>
            <PanelRows>
              <PanelPair label={t('styleCoverAt')}>
                {(['x_pct', 'y_pct'] as const).map((key) => (
                  <NumberInput
                    key={key}
                    label={t(`style_cover_${key.replace('_pct', '')}`)}
                    isLabelHidden
                    units="%"
                    value={cover[key]}
                    min={0}
                    max={100}
                    step={1}
                    isWheelEnabled={false}
                    isDisabled={disabled}
                    onChange={(next) => patchCover({ [key]: next })}
                  />
                ))}
              </PanelPair>
              <PanelPair label={t('styleCoverSize')}>
                {(['width_pct', 'height_pct'] as const).map((key) => (
                  <NumberInput
                    key={key}
                    label={t(`style_cover_${key.replace('_pct', '')}`)}
                    isLabelHidden
                    units="%"
                    value={cover[key]}
                    min={2}
                    max={100}
                    step={1}
                    isWheelEnabled={false}
                    isDisabled={disabled}
                    onChange={(next) => patchCover({ [key]: next })}
                  />
                ))}
              </PanelPair>
              <ColorRow
                label={t('style_cover_color')}
                value={cover.color}
                isInvalid={subtitleStyleFieldInvalid('cover', cover)}
                isDisabled={disabled}
                onChange={(color) => patchCover({ color: color.toUpperCase() })}
              />
              <SliderRow
                label={t('style_cover_opacity')}
                units="%"
                min={0}
                max={100}
                step={5}
                value={Math.round(cover.opacity * 100)}
                isDisabled={disabled}
                onChange={(percent) => patchCover({ opacity: percent / 100 })}
              />
            </PanelRows>
            {onFitCover && (
              <HStack gap={2} vAlign="center">
                <StackItem size="fill">
                  {otherPositions && otherPositions.length > 0 && (
                    <Text type="body" maxLines={1}>
                      {t('styleCoverFitOthers', { positions: otherPositions.join(', ') })}
                    </Text>
                  )}
                </StackItem>
                <Button
                  label={t('styleCoverFit')}
                  isDisabled={disabled}
                  onClick={() => {
                    const fit = onFitCover(value);
                    if (!fit) return;
                    onChange(fit.style);
                    setOtherPositions(fit.others);
                  }}
                />
              </HStack>
            )}
          </>
        )}
      </PanelSection>
      <PanelSection
        title={t('styleAnimation')}
        isOn={animated}
        isDisabled={disabled}
        onToggle={(on) =>
          onChange({
            ...value,
            animation: on
              ? {
                  ...animation,
                  in: { ...animation.in, preset: 'fade' },
                  out: { ...animation.out, preset: 'fade' },
                }
              : structuredClone(defaultSubtitleAnimation),
          })
        }
        onReset={() =>
          onChange({
            ...value,
            accent_color: defaultSubtitleStyle.accent_color,
            animation: {
              in: { ...defaultSubtitleAnimation.in, preset: animated ? 'fade' : 'none' },
              out: { ...defaultSubtitleAnimation.out, preset: animated ? 'fade' : 'none' },
              emphasis: { ...defaultSubtitleAnimation.emphasis },
            },
          })
        }
      >
        <PanelRows>
          <PanelRow label={t('styleInPreset')}>
            <HStack gap={1} vAlign="center">
              <StackItem size="fill">
                <Selector
                  label={t('styleInPreset')}
                  isLabelHidden
                  value={animation.in.preset}
                  isDisabled={disabled}
                  options={ANIMATION_IN_PRESETS.map((preset) => ({
                    value: preset,
                    label: t(`styleInPreset_${preset}`),
                  }))}
                  onChange={(preset) =>
                    onChange({
                      ...value,
                      animation: {
                        ...animation,
                        in: { ...animation.in, preset: preset as typeof animation.in.preset },
                      },
                    })
                  }
                />
              </StackItem>
              <NumberInput
                label={t('styleInDuration')}
                isLabelHidden
                units="s"
                width="var(--panel-value-w)"
                value={animation.in.duration_ms / 1000}
                min={0}
                max={3}
                step={0.05}
                isWheelEnabled={false}
                isDisabled={disabled}
                onChange={(seconds) =>
                  onChange({
                    ...value,
                    animation: {
                      ...animation,
                      in: { ...animation.in, duration_ms: Math.round(seconds * 1000) },
                    },
                  })
                }
              />
            </HStack>
          </PanelRow>
          <PanelRow label={t('styleOutPreset')}>
            <HStack gap={1} vAlign="center">
              <StackItem size="fill">
                <Selector
                  label={t('styleOutPreset')}
                  isLabelHidden
                  value={animation.out.preset}
                  isDisabled={disabled}
                  options={ANIMATION_OUT_PRESETS.map((preset) => ({
                    value: preset,
                    label: t(`styleOutPreset_${preset}`),
                  }))}
                  onChange={(preset) =>
                    onChange({
                      ...value,
                      animation: {
                        ...animation,
                        out: { ...animation.out, preset: preset as typeof animation.out.preset },
                      },
                    })
                  }
                />
              </StackItem>
              <NumberInput
                label={t('styleOutDuration')}
                isLabelHidden
                units="s"
                width="var(--panel-value-w)"
                value={animation.out.duration_ms / 1000}
                min={0}
                max={3}
                step={0.05}
                isWheelEnabled={false}
                isDisabled={disabled}
                onChange={(seconds) =>
                  onChange({
                    ...value,
                    animation: {
                      ...animation,
                      out: { ...animation.out, duration_ms: Math.round(seconds * 1000) },
                    },
                  })
                }
              />
            </HStack>
          </PanelRow>
          <Selector
            label={t('styleEmphasisPreset')}
            value={animation.emphasis.preset}
            isDisabled={disabled}
            options={ANIMATION_EMPHASIS_PRESETS.map((preset) => ({
              value: preset,
              label: t(`styleEmphasisPreset_${preset}`),
            }))}
            onChange={(preset) =>
              onChange({
                ...value,
                animation: {
                  ...animation,
                  emphasis: { preset: preset as typeof animation.emphasis.preset },
                },
              })
            }
          />
          <ColorRow
            label={t('style_accent_color')}
            value={value.accent_color}
            isInvalid={subtitleStyleFieldInvalid('accent_color', value.accent_color)}
            isDisabled={disabled}
            onChange={(accent_color) => onChange({ ...value, accent_color })}
          />
        </PanelRows>
      </PanelSection>
    </PanelSections>
  );
}
