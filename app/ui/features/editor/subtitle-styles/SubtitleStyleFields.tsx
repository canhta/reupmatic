import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ToggleButton, ToggleButtonGroup } from '@astryxdesign/core/ToggleButton';
import { VStack } from '@astryxdesign/core/VStack';
import { type ComponentType, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fontFamilies } from '../../../../core/subtitles/fonts';
import {
  ANIMATION_EMPHASIS_PRESETS,
  ANIMATION_IN_PRESETS,
  ANIMATION_OUT_PRESETS,
  defaultCoverBand,
  type SubtitleStyle,
  subtitleStyleFieldInvalid,
} from '../../../../core/subtitles/style';

/** The on/off control is supplied by the surface: a live Editor preview uses Switch. */
export type CoverToggle = ComponentType<{
  label: string;
  value: boolean;
  isDisabled: boolean;
  description?: string;
  onChange(value: boolean): void;
}>;

interface Props {
  value: SubtitleStyle;
  disabled: boolean;
  coverToggle: CoverToggle;
  onChange(value: SubtitleStyle): void;
  onFitCover?: (current: SubtitleStyle) => { style: SubtitleStyle; others: number[] } | null;
}

// Stored colour is exactly #RRGGBB (core parser); a native color input emits that shape.
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function ColorField({
  fieldKey,
  label,
  value,
  disabled,
  onChange,
}: {
  fieldKey: keyof SubtitleStyle;
  label: string;
  value: string;
  disabled: boolean;
  onChange(next: string): void;
}) {
  const { t } = useTranslation();
  return (
    <HStack gap={2} vAlign="end">
      <StackItem size="fill">
        <TextInput
          label={label}
          value={value}
          isDisabled={disabled}
          status={
            subtitleStyleFieldInvalid(fieldKey, value)
              ? { type: 'error', message: t('styleColorInvalid') }
              : undefined
          }
          onChange={onChange}
        />
      </StackItem>
      <input
        type="color"
        id={`style-color-swatch-${fieldKey}`}
        className="style-color-swatch"
        aria-label={`${label} – ${t('stylePickColor')}`}
        disabled={disabled}
        value={HEX_COLOR.test(value) ? value : '#000000'}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
      />
    </HStack>
  );
}

const colorFields = ['text_color', 'outline_color', 'box_color', 'accent_color'] as const;
const emphasisFields = ['bold', 'italic', 'uppercase'] as const;
const coverFields: {
  key: 'x_pct' | 'y_pct' | 'width_pct' | 'height_pct';
  min: number;
  max: number;
}[] = [
  { key: 'x_pct', min: 0, max: 100 },
  { key: 'y_pct', min: 0, max: 100 },
  { key: 'width_pct', min: 2, max: 100 },
  { key: 'height_pct', min: 2, max: 100 },
];
const advancedNumeric: { key: keyof SubtitleStyle; min: number; max: number; step: number }[] = [
  { key: 'outline_pct', min: 0, max: 2, step: 0.05 },
  { key: 'shadow_pct', min: 0, max: 2, step: 0.05 },
  { key: 'box_opacity', min: 0, max: 1, step: 0.05 },
  { key: 'margin_x_pct', min: 0, max: 40, step: 1 },
  { key: 'margin_y_pct', min: 0, max: 40, step: 1 },
  { key: 'spacing_pct', min: -0.2, max: 2, step: 0.05 },
];

export function SubtitleStyleFields({ value, disabled, coverToggle, onChange, onFitCover }: Props) {
  const { t } = useTranslation();
  const [otherPositions, setOtherPositions] = useState<number[] | null>(null);
  const Cover = coverToggle;
  const emphasis = emphasisFields.filter((key) => value[key]);
  return (
    <VStack gap={3}>
      <FormLayout direction="vertical">
        <Selector
          label={t('styleFontFamily')}
          value={value.font_family}
          isDisabled={disabled}
          options={fontFamilies.map((family) => ({ value: family, label: family }))}
          onChange={(font_family) => onChange({ ...value, font_family })}
        />
        <NumberInput
          label={t('style_font_size_pct')}
          value={Number(value.font_size_pct)}
          min={1}
          max={15}
          step={0.25}
          isWheelEnabled={false}
          isDisabled={disabled}
          status={
            subtitleStyleFieldInvalid('font_size_pct', value.font_size_pct)
              ? { type: 'error', message: t('styleNumberInvalid') }
              : undefined
          }
          onChange={(font_size_pct) => onChange({ ...value, font_size_pct })}
        />
        <Selector
          label={t('stylePosition')}
          value={String(value.position)}
          isDisabled={disabled}
          options={[7, 8, 9, 4, 5, 6, 1, 2, 3].map((position) => ({
            value: String(position),
            label: t(`stylePosition_${position}`),
          }))}
          onChange={(position) => onChange({ ...value, position: Number(position) })}
        />
      </FormLayout>
      <ToggleButtonGroup
        label={t('styleFormat')}
        type="multiple"
        value={emphasis}
        isDisabled={disabled}
        onChange={(next) =>
          onChange({
            ...value,
            bold: next.includes('bold'),
            italic: next.includes('italic'),
            uppercase: next.includes('uppercase'),
          })
        }
      >
        <ToggleButton value="bold" label={t('styleBold')} />
        <ToggleButton value="italic" label={t('styleItalic')} />
        <ToggleButton value="uppercase" label={t('styleUppercase')} />
      </ToggleButtonGroup>
      <Grid columns={2} gap={3}>
        {colorFields.map((key) => (
          <ColorField
            key={key}
            fieldKey={key}
            label={t(`style_${key}`)}
            value={value[key]}
            disabled={disabled}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
        ))}
      </Grid>
      <Collapsible
        trigger={
          <Text type="body" weight="semibold">
            {t('styleCoverBand')}
          </Text>
        }
        defaultIsOpen={false}
      >
        <VStack gap={3}>
          <Cover
            label={t('styleCover')}
            description={t('styleCoverNote')}
            value={value.cover !== null}
            isDisabled={disabled}
            onChange={(on) => onChange({ ...value, cover: on ? defaultCoverBand(value) : null })}
          />
          {value.cover && (
            <>
              {onFitCover && (
                <Button
                  label={t('styleCoverFit')}
                  size="sm"
                  isDisabled={disabled}
                  onClick={() => {
                    const fit = onFitCover(value);
                    if (!fit) return;
                    onChange(fit.style);
                    setOtherPositions(fit.others);
                  }}
                />
              )}
              {otherPositions && otherPositions.length > 0 && (
                <Text as="p" type="body">
                  {t('styleCoverFitOthers', { positions: otherPositions.join(', ') })}
                </Text>
              )}
              <Grid columns={2} gap={3}>
                {coverFields.map(({ key, min, max }) => (
                  <NumberInput
                    key={key}
                    label={t(`style_cover_${key.replace('_pct', '')}`)}
                    units="%"
                    width="100%"
                    value={value.cover?.[key] ?? min}
                    min={min}
                    max={max}
                    step={1}
                    isWheelEnabled={false}
                    isDisabled={disabled}
                    onChange={(next) =>
                      value.cover && onChange({ ...value, cover: { ...value.cover, [key]: next } })
                    }
                  />
                ))}
              </Grid>
              <HStack gap={2} vAlign="end">
                <StackItem size="fill">
                  <TextInput
                    label={t('style_cover_color')}
                    value={value.cover.color}
                    isDisabled={disabled}
                    status={
                      subtitleStyleFieldInvalid('cover', value.cover)
                        ? { type: 'error', message: t('styleColorInvalid') }
                        : undefined
                    }
                    onChange={(color) =>
                      value.cover && onChange({ ...value, cover: { ...value.cover, color } })
                    }
                  />
                </StackItem>
                <input
                  type="color"
                  className="style-color-swatch"
                  aria-label={`${t('style_cover_color')} – ${t('stylePickColor')}`}
                  disabled={disabled}
                  value={HEX_COLOR.test(value.cover.color) ? value.cover.color : '#000000'}
                  onChange={(event) =>
                    value.cover &&
                    onChange({ ...value, cover: { ...value.cover, color: event.target.value } })
                  }
                />
              </HStack>
              <NumberInput
                label={t('style_cover_opacity')}
                value={value.cover.opacity}
                min={0}
                max={1}
                step={0.05}
                isWheelEnabled={false}
                isDisabled={disabled}
                onChange={(opacity) =>
                  value.cover && onChange({ ...value, cover: { ...value.cover, opacity } })
                }
              />
            </>
          )}
        </VStack>
      </Collapsible>
      <Collapsible
        trigger={
          <Text type="body" weight="semibold">
            {t('styleAnimation')}
          </Text>
        }
        defaultIsOpen={false}
      >
        <FormLayout direction="vertical">
          <Selector
            label={t('styleInPreset')}
            value={value.animation.in.preset}
            isDisabled={disabled}
            options={ANIMATION_IN_PRESETS.map((preset) => ({
              value: preset,
              label: t(`styleInPreset_${preset}`),
            }))}
            onChange={(preset) =>
              onChange({
                ...value,
                animation: {
                  ...value.animation,
                  in: { ...value.animation.in, preset: preset as typeof value.animation.in.preset },
                },
              })
            }
          />
          <NumberInput
            label={t('styleInDuration')}
            value={value.animation.in.duration_ms}
            min={0}
            max={3000}
            step={50}
            isIntegerOnly
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(duration_ms) =>
              onChange({
                ...value,
                animation: { ...value.animation, in: { ...value.animation.in, duration_ms } },
              })
            }
          />
          <Selector
            label={t('styleOutPreset')}
            value={value.animation.out.preset}
            isDisabled={disabled}
            options={ANIMATION_OUT_PRESETS.map((preset) => ({
              value: preset,
              label: t(`styleOutPreset_${preset}`),
            }))}
            onChange={(preset) =>
              onChange({
                ...value,
                animation: {
                  ...value.animation,
                  out: {
                    ...value.animation.out,
                    preset: preset as typeof value.animation.out.preset,
                  },
                },
              })
            }
          />
          <NumberInput
            label={t('styleOutDuration')}
            value={value.animation.out.duration_ms}
            min={0}
            max={3000}
            step={50}
            isIntegerOnly
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(duration_ms) =>
              onChange({
                ...value,
                animation: { ...value.animation, out: { ...value.animation.out, duration_ms } },
              })
            }
          />
          <Selector
            label={t('styleEmphasisPreset')}
            value={value.animation.emphasis.preset}
            isDisabled={disabled}
            options={ANIMATION_EMPHASIS_PRESETS.map((preset) => ({
              value: preset,
              label: t(`styleEmphasisPreset_${preset}`),
            }))}
            onChange={(preset) =>
              onChange({
                ...value,
                animation: {
                  ...value.animation,
                  emphasis: {
                    preset: preset as typeof value.animation.emphasis.preset,
                  },
                },
              })
            }
          />
        </FormLayout>
      </Collapsible>
      <Collapsible
        trigger={
          <Text type="body" weight="semibold">
            {t('styleShadowBackground')}
          </Text>
        }
        defaultIsOpen={false}
      >
        <FormLayout direction="vertical">
          {advancedNumeric.map(({ key, min, max, step }) => (
            <NumberInput
              key={key}
              label={t(`style_${key}`)}
              value={Number(value[key])}
              min={min}
              max={max}
              step={step}
              isWheelEnabled={false}
              isDisabled={disabled}
              status={
                subtitleStyleFieldInvalid(key, value[key])
                  ? { type: 'error', message: t('styleNumberInvalid') }
                  : undefined
              }
              onChange={(next) => onChange({ ...value, [key]: next })}
            />
          ))}
        </FormLayout>
      </Collapsible>
    </VStack>
  );
}
