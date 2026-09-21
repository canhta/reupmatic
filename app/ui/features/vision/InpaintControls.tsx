import { NumberInput } from '@astryxdesign/core/NumberInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Switch } from '@astryxdesign/core/Switch';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  InpaintOptions,
  ProcessingLanguage,
  ProcessingRecipe,
  ProcessingRegion,
} from '../../../core/processing/recipe';
import { MaskRegionFields } from '../processing/MaskRegionFields';

interface Props {
  processing: ProcessingRecipe | undefined;
  onChangeProcessing: (value: ProcessingRecipe | undefined) => void;
  language: ProcessingLanguage | null;
  available: boolean;
  hasOcr: boolean;
}

function withInpaint(
  processing: ProcessingRecipe | undefined,
  inpaint: InpaintOptions | undefined,
): ProcessingRecipe | undefined {
  const next: ProcessingRecipe = { ...(processing ?? {}) };
  if (inpaint) next.inpaint = inpaint;
  else delete next.inpaint;
  return next.ocr || next.inpaint || next.editing || next.subtitle_style ? next : undefined;
}

/**
 * Removal is a render step, not its own preview: the "Include in
 * render" switch writes straight into the live recipe, and the monitor's
 * one "Render sample" (`MediaStage`) already sends the whole recipe,
 * including this, to the worker.
 */
export function InpaintControls({
  processing,
  onChangeProcessing,
  language,
  available,
  hasOcr,
}: Props) {
  const { t } = useTranslation();
  const included = Boolean(processing?.inpaint);
  const [target, setTarget] = useState<'manual' | 'text'>(processing?.inpaint?.target ?? 'manual');
  const [padding, setPadding] = useState(processing?.inpaint?.padding_px ?? 4);
  const [rectangle, setRectangle] = useState<ProcessingRegion>(
    processing?.inpaint?.target === 'manual'
      ? processing.inpaint.region
      : { x: 0.1, y: 0.7, width: 0.8, height: 0.2 },
  );
  const validRegion =
    rectangle.width > 0 &&
    rectangle.height > 0 &&
    rectangle.x + rectangle.width <= 1 + 1e-9 &&
    rectangle.y + rectangle.height <= 1 + 1e-9;
  const canInclude = target === 'text' ? hasOcr && language !== null : validRegion;

  function options(
    nextTarget: 'manual' | 'text',
    nextPadding: number,
    nextRectangle: ProcessingRegion,
  ): InpaintOptions {
    return nextTarget === 'manual'
      ? { target: 'manual', padding_px: nextPadding, region: nextRectangle }
      : { target: 'text', padding_px: nextPadding, language: language ?? 'en' };
  }

  function update(
    nextTarget: 'manual' | 'text',
    nextPadding: number,
    nextRectangle: ProcessingRegion,
  ) {
    if (included)
      onChangeProcessing(withInpaint(processing, options(nextTarget, nextPadding, nextRectangle)));
  }

  return (
    <div className="inpaint-controls">
      <Switch
        label={t('visionInclude')}
        value={included}
        isDisabled={!available || (!included && !canInclude)}
        onChange={(checked) =>
          onChangeProcessing(
            withInpaint(processing, checked ? options(target, padding, rectangle) : undefined),
          )
        }
      />
      <RadioList
        label={t('visionTarget')}
        value={target}
        isDisabled={!included}
        onChange={(value) => {
          if (value === 'manual' || value === 'text') {
            setTarget(value);
            update(value, padding, rectangle);
          }
        }}
      >
        <RadioListItem value="manual" label={t('visionManual')} />
        <RadioListItem value="text" label={t('visionAuto')} description={t('visionAutoNote')} />
      </RadioList>
      <div className="vision-fields">
        <NumberInput
          label={t('visionPadding')}
          min={0}
          max={32}
          step={1}
          width={180}
          value={padding}
          isDisabled={!included}
          isWheelEnabled={false}
          isIntegerOnly
          onChange={(value) => {
            setPadding(value);
            update(target, value, rectangle);
          }}
        />
      </div>
      {target === 'manual' && (
        <MaskRegionFields
          value={rectangle}
          onChange={(value) => {
            setRectangle(value);
            update(target, padding, value);
          }}
          disabled={!included}
        />
      )}
    </div>
  );
}
