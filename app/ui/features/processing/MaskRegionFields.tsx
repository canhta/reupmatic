import { NumberInput } from '@astryxdesign/core/NumberInput';
import { useTranslation } from 'react-i18next';
import type { ProcessingRegion } from '../../../core/processing/recipe';

interface Props {
  value: ProcessingRegion;
  disabled: boolean;
  onChange(value: ProcessingRegion): void;
}

export function MaskRegionFields({ value, disabled, onChange }: Props) {
  const { t } = useTranslation();
  const fields = [
    ['x', 'visionX'],
    ['y', 'visionY'],
    ['width', 'visionWidth'],
    ['height', 'visionHeight'],
  ] as const;
  const valid =
    value.width > 0 &&
    value.height > 0 &&
    value.x + value.width <= 1 + 1e-9 &&
    value.y + value.height <= 1 + 1e-9;
  return (
    <>
      <div className="vision-fields">
        {fields.map(([key, label]) => (
          <NumberInput
            key={key}
            label={t(label)}
            value={Math.round(value[key] * 10000) / 100}
            min={0}
            max={100}
            step={1}
            width={144}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(percent) => onChange({ ...value, [key]: percent / 100 })}
          />
        ))}
      </div>
      {!valid && (
        <p className="inline-error" role="alert">
          {t('visionInvalid')}
        </p>
      )}
    </>
  );
}
