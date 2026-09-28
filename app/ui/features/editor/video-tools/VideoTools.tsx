import { Icon } from '@astryxdesign/core/Icon';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { ToggleButton, ToggleButtonGroup } from '@astryxdesign/core/ToggleButton';
import { FlipHorizontal2, FlipVertical2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CropRegion, EditingRecipe } from '../../../../core/editing/edit-recipe';
import {
  PanelPair,
  PanelRow,
  PanelRows,
  PanelSection,
  SliderRow,
} from '../../../design-system/Panel';

interface ToolProps {
  value: EditingRecipe;
  disabled: boolean;
  onChange(patch: Partial<EditingRecipe>): void;
}

const ASPECTS = ['source', '9:16', '16:9', '1:1', '4:5'] as const;
const ROTATIONS = [0, 90, 180, 270] as const;
const NO_COLOR = { brightness: 0, contrast: 1, saturation: 1 };

/** Video › Frame: the output shape, then how the picture turns inside it. */
export function FrameSection({ value, disabled, onChange }: ToolProps) {
  const { t } = useTranslation();
  const output: NonNullable<EditingRecipe['output']> = value.output ?? {
    aspect: 'source',
    fit: 'contain',
    height: 0,
  };
  const flip = value.flip;
  const flips = flip === 'both' ? ['horizontal', 'vertical'] : flip ? [flip] : [];
  return (
    <PanelSection
      title={t('editFrame')}
      isDisabled={disabled}
      onReset={() =>
        onChange({
          output: value.output ? { ...value.output, aspect: 'source', fit: 'contain' } : undefined,
          rotate: undefined,
          flip: undefined,
        })
      }
    >
      <PanelRows>
        <Selector
          label={t('editAspect')}
          value={output.aspect}
          isDisabled={disabled}
          options={ASPECTS.map((aspect) => ({
            value: aspect,
            label: aspect === 'source' ? t('editSourceAspect') : aspect,
          }))}
          onChange={(aspect) =>
            onChange({ output: { ...output, aspect: aspect as typeof output.aspect } })
          }
        />
        <PanelRow label={t('editFit')}>
          <SegmentedControl
            label={t('editFit')}
            value={output.fit}
            size="sm"
            layout="fill"
            isDisabled={disabled || output.aspect === 'source'}
            onChange={(fit) => {
              if (fit === 'contain' || fit === 'cover') onChange({ output: { ...output, fit } });
            }}
          >
            <SegmentedControlItem value="contain" label={t('editFit_contain')} />
            <SegmentedControlItem value="cover" label={t('editFit_cover')} />
          </SegmentedControl>
        </PanelRow>
        <PanelRow label={t('editRotate')}>
          <SegmentedControl
            label={t('editRotate')}
            value={String(value.rotate ?? 0)}
            size="sm"
            layout="fill"
            isDisabled={disabled}
            onChange={(rotate) =>
              onChange({
                rotate: Number(rotate) === 0 ? undefined : (Number(rotate) as 90 | 180 | 270),
              })
            }
          >
            {ROTATIONS.map((rotate) => (
              <SegmentedControlItem key={rotate} value={String(rotate)} label={`${rotate}°`} />
            ))}
          </SegmentedControl>
        </PanelRow>
        <PanelRow label={t('editFlip')}>
          <ToggleButtonGroup
            label={t('editFlip')}
            type="multiple"
            size="sm"
            value={flips}
            isDisabled={disabled}
            onChange={(next) => {
              const on = Array.isArray(next) ? next : [];
              const h = on.includes('horizontal');
              const v = on.includes('vertical');
              onChange({ flip: h && v ? 'both' : h ? 'horizontal' : v ? 'vertical' : undefined });
            }}
          >
            <ToggleButton
              value="horizontal"
              label={t('editFlip_horizontal')}
              isIconOnly
              icon={<Icon icon={FlipHorizontal2} size="sm" />}
            />
            <ToggleButton
              value="vertical"
              label={t('editFlip_vertical')}
              isIconOnly
              icon={<Icon icon={FlipVertical2} size="sm" />}
            />
          </ToggleButtonGroup>
        </PanelRow>
      </PanelRows>
    </PanelSection>
  );
}

/** Video › Speed: tuned by feel around 1×; the output length follows when it is known. */
export function SpeedSection({
  value,
  disabled,
  onChange,
  outputMs,
}: ToolProps & { outputMs?: number }) {
  const { t } = useTranslation();
  return (
    <PanelSection
      title={t('editSpeed')}
      isDisabled={disabled}
      onReset={() => onChange({ speed: undefined })}
    >
      <PanelRows>
        <SliderRow
          label={t('editSpeed')}
          units="×"
          min={0.25}
          max={4}
          step={0.05}
          sliderRange={[0.5, 2]}
          marks={[{ value: 1, label: '1×' }]}
          value={value.speed ?? 1}
          isDisabled={disabled}
          onChange={(speed) => onChange({ speed })}
        />
      </PanelRows>
      {outputMs !== undefined && (
        <Text type="body" role="status">
          {t('editDuration', { seconds: (outputMs / 1000).toFixed(1) })}
        </Text>
      )}
    </PanelSection>
  );
}

/** Video › Crop: a region of the source, switched on in its header. */
export function CropSection({ value, disabled, onChange }: ToolProps) {
  const { t } = useTranslation();
  const crop = value.crop;
  const pair = (label: string, keys: [keyof CropRegion, keyof CropRegion], floor: number) =>
    crop && (
      <PanelPair label={label}>
        {keys.map((key) => (
          <NumberInput
            key={key}
            label={t(`editCrop_${key}`)}
            isLabelHidden
            units="%"
            value={Math.round(crop[key] * 10000) / 100}
            min={floor}
            max={100}
            step={1}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(number) => onChange({ crop: { ...crop, [key]: number / 100 } })}
          />
        ))}
      </PanelPair>
    );
  return (
    <PanelSection
      title={t('editCrop')}
      isOn={Boolean(crop)}
      isDisabled={disabled}
      onToggle={(on) => onChange({ crop: on ? { x: 0, y: 0, width: 1, height: 1 } : undefined })}
    >
      <PanelRows>
        {pair(t('editCropOffset'), ['x', 'y'], 0)}
        {pair(t('editCropSize'), ['width', 'height'], 1)}
      </PanelRows>
    </PanelSection>
  );
}

/** Video › Color: tuned by feel, so each is a slider with its typed value. */
export function ColorSection({ value, disabled, onChange }: ToolProps) {
  const { t } = useTranslation();
  const color = value.color ?? NO_COLOR;
  return (
    <PanelSection
      title={t('editColor')}
      isDisabled={disabled}
      onReset={() => onChange({ color: undefined })}
    >
      <PanelRows>
        {(
          [
            ['brightness', -1, 1],
            ['contrast', 0, 2],
            ['saturation', 0, 3],
          ] as const
        ).map(([key, min, max]) => (
          <SliderRow
            key={key}
            label={t(`editColor_${key}`)}
            value={color[key]}
            min={min}
            max={max}
            step={0.05}
            isDisabled={disabled}
            onChange={(number) => onChange({ color: { ...color, [key]: number } })}
          />
        ))}
      </PanelRows>
    </PanelSection>
  );
}
