import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useTranslation } from 'react-i18next';
import type { SubtitleStyle } from '../../../../core/subtitles/style';

interface Props {
  value: SubtitleStyle;
  disabled: boolean;
  onChange(value: SubtitleStyle): void;
}
const numeric: { key: keyof SubtitleStyle; min: number; max: number; step: number }[] = [
  { key: 'font_size_pct', min: 1, max: 15, step: 0.25 },
  { key: 'outline_pct', min: 0, max: 2, step: 0.05 },
  { key: 'shadow_pct', min: 0, max: 2, step: 0.05 },
  { key: 'box_opacity', min: 0, max: 1, step: 0.05 },
  { key: 'margin_x_pct', min: 0, max: 40, step: 1 },
  { key: 'margin_y_pct', min: 0, max: 40, step: 1 },
  { key: 'spacing_pct', min: -0.2, max: 2, step: 0.05 },
];

export function SubtitleStyleFields({ value, disabled, onChange }: Props) {
  const { t } = useTranslation();
  return <div className="vision-fields">
    <TextInput label={t('styleFontFamily')} value={value.font_family} isDisabled={disabled}
      onChange={font_family => onChange({ ...value, font_family })} />
    <Selector label={t('stylePosition')} value={String(value.position)} isDisabled={disabled}
      options={[7, 8, 9, 4, 5, 6, 1, 2, 3].map(position => ({ value: String(position), label: t(`stylePosition_${position}`) }))}
      onChange={position => onChange({ ...value, position: Number(position) })} />
    {(['text_color', 'outline_color', 'box_color'] as const).map(key => <TextInput key={key}
      label={t(`style_${key}`)} value={value[key]} isDisabled={disabled}
      onChange={next => onChange({ ...value, [key]: next })} />)}
    {numeric.map(({ key, min, max, step }) => <NumberInput key={key} label={t(`style_${key}`)}
      value={Number(value[key])} min={min} max={max} step={step} isWheelEnabled={false} isDisabled={disabled}
      onChange={next => onChange({ ...value, [key]: next })} />)}
    <CheckboxInput label={t('styleBold')} value={value.bold} isDisabled={disabled}
      onChange={bold => onChange({ ...value, bold })} />
    <CheckboxInput label={t('styleItalic')} value={value.italic} isDisabled={disabled}
      onChange={italic => onChange({ ...value, italic })} />
  </div>;
}
