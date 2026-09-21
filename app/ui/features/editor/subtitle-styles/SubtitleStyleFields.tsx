import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useTranslation } from 'react-i18next';
import type { SubtitleStyle } from '../../../../core/subtitles/style';

interface Props {
  value: SubtitleStyle;
  disabled: boolean;
  onChange(value: SubtitleStyle): void;
}

// parseSubtitleStyle (core/subtitles/style.ts) is the source of truth for
// what a valid stored color looks like: exactly `#RRGGBB`, no alpha. A
// native `<input type="color">` only ever emits that shape, so the swatch
// can write straight back into the same field the hex TextInput edits.
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// No Astryx colour picker exists yet (Gap list):
// this pairs the existing hex TextInput with a native swatch instead —
// semantic HTML for a specialist input no Astryx component covers. The
// swatch is the pick affordance; the
// TextInput stays the one place to type or paste an exact hex value.
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
    <div className="style-color-field">
      <TextInput label={label} value={value} isDisabled={disabled} onChange={onChange} />
      <input
        type="color"
        id={`style-color-swatch-${fieldKey}`}
        className="style-color-swatch"
        aria-label={`${label} – ${t('stylePickColor')}`}
        disabled={disabled}
        value={HEX_COLOR.test(value) ? value : '#000000'}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
      />
    </div>
  );
}

const colorFields = ['text_color', 'outline_color', 'box_color'] as const;
// Outline width, shadow, background opacity, margins and spacing are set far
// less often than the basics/colours above, so — along with bold/italic —
// they sit behind a collapsed section.
const advancedNumeric: { key: keyof SubtitleStyle; min: number; max: number; step: number }[] = [
  { key: 'outline_pct', min: 0, max: 2, step: 0.05 },
  { key: 'shadow_pct', min: 0, max: 2, step: 0.05 },
  { key: 'box_opacity', min: 0, max: 1, step: 0.05 },
  { key: 'margin_x_pct', min: 0, max: 40, step: 1 },
  { key: 'margin_y_pct', min: 0, max: 40, step: 1 },
  { key: 'spacing_pct', min: -0.2, max: 2, step: 0.05 },
];

export function SubtitleStyleFields({ value, disabled, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <>
      <div className="vision-fields">
        <TextInput
          label={t('styleFontFamily')}
          value={value.font_family}
          isDisabled={disabled}
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
      </div>
      <div className="vision-fields">
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
      </div>
      <Collapsible
        trigger={
          <Text type="label" weight="semibold">
            {t('styleShadowBackground')}
          </Text>
        }
        defaultIsOpen={false}
      >
        <div className="vision-fields">
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
        </div>
      </Collapsible>
    </>
  );
}
