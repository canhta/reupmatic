import { Grid } from '@astryxdesign/core/Grid';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import type { EditingRecipe } from '../../../../core/editing/edit-recipe';
import type { ToggleControl } from '../ToggleControl';

export function VideoTools({
  value,
  disabled,
  onChange,
  toggle: Toggle,
}: {
  value: EditingRecipe;
  disabled: boolean;
  onChange(patch: Partial<EditingRecipe>): void;
  toggle: ToggleControl;
}) {
  const { t } = useTranslation();
  const output: NonNullable<EditingRecipe['output']> = value.output ?? {
    aspect: 'source',
    fit: 'contain',
    height: 0,
  };
  const color = value.color ?? { brightness: 0, contrast: 1, saturation: 1 };
  return (
    <VStack gap={3}>
      <Grid columns={2} gap={3}>
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
          options={[
            { value: 'contain', label: t('editFit_contain') },
            { value: 'cover', label: t('editFit_cover'), description: t('editGeometryHint') },
          ]}
          onChange={(fit) => onChange({ output: { ...output, fit: fit as typeof output.fit } })}
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
      </Grid>
      <Toggle
        label={t('editCrop')}
        value={Boolean(value.crop)}
        isDisabled={disabled}
        onChange={(enabled) =>
          onChange({ crop: enabled ? { x: 0, y: 0, width: 1, height: 1 } : undefined })
        }
      />
      {value.crop && (
        <Grid columns={2} gap={3}>
          {(['x', 'y', 'width', 'height'] as const).map((key) => {
            const crop = value.crop;
            if (!crop) return null;
            return (
              <NumberInput
                key={key}
                label={t(`editCrop_${key}`)}
                units="%"
                width="100%"
                value={Math.round(crop[key] * 10000) / 100}
                min={key === 'width' || key === 'height' ? 1 : 0}
                max={100}
                step={1}
                isWheelEnabled={false}
                isDisabled={disabled}
                onChange={(number) => onChange({ crop: { ...crop, [key]: number / 100 } })}
              />
            );
          })}
        </Grid>
      )}
      <Grid columns={2} gap={3}>
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
            width="100%"
            value={color[key]}
            min={min}
            max={max}
            step={0.05}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(number) => onChange({ color: { ...color, [key]: number } })}
          />
        ))}
      </Grid>
    </VStack>
  );
}
