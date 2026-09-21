import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { useTranslation } from 'react-i18next';
import type { EditingRecipe } from '../../../../core/editing/edit-recipe';

export function VideoTools({
  value,
  disabled,
  onChange,
}: {
  value: EditingRecipe;
  disabled: boolean;
  onChange(patch: Partial<EditingRecipe>): void;
}) {
  const { t } = useTranslation();
  const output: NonNullable<EditingRecipe['output']> = value.output ?? {
    aspect: 'source',
    fit: 'contain',
    height: 0,
  };
  const color = value.color ?? { brightness: 0, contrast: 1, saturation: 1 };
  return (
    <div className="business-form">
      <div className="business-toolbar">
        <Selector
          label={t('editAspect')}
          value={output.aspect}
          isDisabled={disabled}
          options={(['source', '9:16', '16:9', '1:1', '4:5'] as const).map((aspect) => ({
            value: aspect,
            label: aspect === 'source' ? t('editSourceAspect') : aspect,
          }))}
          onChange={(aspect) =>
            onChange({ output: { ...output, aspect: aspect as typeof output.aspect } })
          }
        />
        <Selector
          label={t('editFit')}
          value={output.fit}
          isDisabled={disabled || output.aspect === 'source'}
          options={['contain', 'cover'].map((fit) => ({ value: fit, label: t(`editFit_${fit}`) }))}
          onChange={(fit) => onChange({ output: { ...output, fit: fit as typeof output.fit } })}
        />
        <Selector
          label={t('editResolution')}
          value={String(output.height)}
          isDisabled={disabled}
          options={[0, 480, 720, 1080, 1920].map((height) => ({
            value: String(height),
            label: height === 0 ? t('editSourceHeight') : `${height}px`,
          }))}
          onChange={(height) =>
            onChange({ output: { ...output, height: Number(height) as typeof output.height } })
          }
        />
        <Selector
          label={t('editFlip')}
          value={value.flip ?? 'none'}
          isDisabled={disabled}
          options={['none', 'horizontal', 'vertical', 'both'].map((flip) => ({
            value: flip,
            label: t(`editFlip_${flip}`),
          }))}
          onChange={(flip) =>
            onChange({ flip: flip === 'none' ? undefined : (flip as EditingRecipe['flip']) })
          }
        />
        <Selector
          label={t('editRotate')}
          value={String(value.rotate ?? 0)}
          isDisabled={disabled}
          options={[0, 90, 180, 270].map((rotate) => ({
            value: String(rotate),
            label: t(`editRotate_${rotate}`),
          }))}
          onChange={(rotate) =>
            onChange({
              rotate: Number(rotate) === 0 ? undefined : (Number(rotate) as 90 | 180 | 270),
            })
          }
        />
      </div>
      <CheckboxInput
        label={t('editCrop')}
        value={Boolean(value.crop)}
        isDisabled={disabled}
        onChange={(enabled) =>
          onChange({ crop: enabled ? { x: 0, y: 0, width: 1, height: 1 } : undefined })
        }
      />
      {value.crop && (
        <div className="business-toolbar">
          {(['x', 'y', 'width', 'height'] as const).map((key) => {
            const crop = value.crop;
            if (!crop) return null;
            return (
              <NumberInput
                key={key}
                label={t(`editCrop_${key}`)}
                value={Math.round(crop[key] * 10000) / 100}
                min={key === 'width' || key === 'height' ? 1 : 0}
                max={100}
                step={1}
                width={160}
                isWheelEnabled={false}
                isDisabled={disabled}
                onChange={(number) => onChange({ crop: { ...crop, [key]: number / 100 } })}
              />
            );
          })}
        </div>
      )}
      <div className="business-toolbar">
        {(
          [
            ['brightness', -1, 1],
            ['contrast', 0, 2],
            ['saturation', 0, 3],
          ] as const
        ).map(([key, min, max]) => (
          <NumberInput
            key={key}
            label={t(`editColor_${key}`)}
            value={color[key]}
            min={min}
            max={max}
            step={0.05}
            width={180}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(number) => onChange({ color: { ...color, [key]: number } })}
          />
        ))}
      </div>
      <Text as="p" type="supporting">
        {t('editGeometryHint')}
      </Text>
    </div>
  );
}
