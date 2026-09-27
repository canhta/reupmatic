import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { HStack } from '@astryxdesign/core/HStack';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  defaultCoverBand,
  type SubtitleStyle,
  subtitleStyleFieldInvalid,
} from '../../../../core/subtitles/style';

interface Props {
  value: SubtitleStyle;
  disabled: boolean;
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

const colorFields = ['text_color', 'outline_color', 'box_color'] as const;
const advancedNumeric: { key: keyof SubtitleStyle; min: number; max: number; step: number }[] = [
  { key: 'outline_pct', min: 0, max: 2, step: 0.05 },
  { key: 'shadow_pct', min: 0, max: 2, step: 0.05 },
  { key: 'box_opacity', min: 0, max: 1, step: 0.05 },
  { key: 'margin_x_pct', min: 0, max: 40, step: 1 },
  { key: 'margin_y_pct', min: 0, max: 40, step: 1 },
  { key: 'spacing_pct', min: -0.2, max: 2, step: 0.05 },
];

export function SubtitleStyleFields({ value, disabled, onChange, onFitCover }: Props) {
  const { t } = useTranslation();
  const [otherPositions, setOtherPositions] = useState<number[] | null>(null);
  return (
    <VStack gap={3}>
      <FormLayout direction="vertical">
        <TextInput
          label={t('styleFontFamily')}
          value={value.font_family}
          isDisabled={disabled}
          status={
            subtitleStyleFieldInvalid('font_family', value.font_family)
              ? { type: 'error', message: t('styleFontInvalid') }
              : undefined
          }
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
      <FormLayout direction="vertical">
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
      </FormLayout>
      <CheckboxInput
        label={t('styleCover')}
        value={value.cover !== null}
        isDisabled={disabled}
        onChange={(on) => onChange({ ...value, cover: on ? defaultCoverBand(value) : null })}
      />
      {value.cover && (
        <FormLayout direction="vertical">
          <Text as="p" type="supporting">
            {t('styleCoverNote')}
          </Text>
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
            <Text as="p" type="supporting">
              {t('styleCoverFitOthers', { positions: otherPositions.join(', ') })}
            </Text>
          )}
          {(
            [
              ['x_pct', 0, 100],
              ['y_pct', 0, 100],
              ['width_pct', 2, 100],
              ['height_pct', 2, 100],
            ] as const
          ).map(([key, min, max]) => (
            <NumberInput
              key={key}
              label={t(`style_cover_${key}`)}
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
          <HStack gap={2} vAlign="end">
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
        </FormLayout>
      )}
      <Collapsible
        trigger={
          <Text type="label" weight="semibold">
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
          <CheckboxInput
            label={t('styleBold')}
            value={value.bold}
            isDisabled={disabled}
            onChange={(bold) => onChange({ ...value, bold })}
          />
          <CheckboxInput
            label={t('styleItalic')}
            value={value.italic}
            isDisabled={disabled}
            onChange={(italic) => onChange({ ...value, italic })}
          />
        </FormLayout>
      </Collapsible>
    </VStack>
  );
}
