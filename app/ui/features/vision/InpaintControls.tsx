import { MaskRegionFields } from '../processing/MaskRegionFields';
import { Button } from '@astryxdesign/core/Button';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VisionParams } from '../../../core/vision/vision';

interface Props {
  busy: boolean;
  available: boolean;
  hasOcr: boolean;
  onStart: (settings: Partial<VisionParams>) => Promise<void>;
}

export function InpaintControls({ busy, available, hasOcr, onStart }: Props) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<'manual' | 'text'>('manual');
  const [padding, setPadding] = useState(4);
  const [rectangle, setRectangle] = useState({ x: 0.1, y: 0.7, width: 0.8, height: 0.2 });
  const validRegion = rectangle.width > 0 && rectangle.height > 0
    && rectangle.x + rectangle.width <= 1 + 1e-9 && rectangle.y + rectangle.height <= 1 + 1e-9;

  function start() {
    const settings: Partial<VisionParams> = { target, padding_px: padding };
    if (target === 'manual') {
      settings.region = rectangle;
    }
    void onStart(settings);
  }

  return (
    <div className="inpaint-controls">
      <RadioList label={t('visionTarget')} value={target} isDisabled={busy}
        onChange={value => { if (value === 'manual' || value === 'text') setTarget(value); }}>
        <RadioListItem value="manual" label={t('visionManual')} />
        <RadioListItem value="text" label={t('visionAuto')} description={t('visionAutoNote')} />
      </RadioList>
      <div className="vision-fields">
        <NumberInput label={t('visionPadding')} min={0} max={32} step={1} width={180}
          value={padding} isDisabled={busy} isWheelEnabled={false} isIntegerOnly
          onChange={setPadding} />
      </div>
      {target === 'manual' && <MaskRegionFields value={rectangle} onChange={setRectangle} disabled={busy} />}
      <Button label={t('visionRemove')} variant="primary"
        isDisabled={busy || !available || (target === 'text' ? !hasOcr : !validRegion)}
        onClick={start} />
      <p className="field-help">{t('visionProxy')}</p>
    </div>
  );
}
