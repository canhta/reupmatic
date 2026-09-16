import { LocalModelSetup } from '../settings/LocalModelSetup';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Section } from '@astryxdesign/core/Section';
import { Selector } from '@astryxdesign/core/Selector';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContentLanguage, OcrResult } from '../../../core/vision/vision';
import { InpaintControls } from './InpaintControls';
import { visionErrorKey } from './i18n';
import { useVisionJob, type VisionContext } from './useVisionJob';
import { VisionResults } from './VisionResults';

interface Props extends VisionContext {
  onApply: (result: OcrResult, capturedRevision: number) => boolean;
}

export function VisionPanel(props: Props) {
  const { t } = useTranslation();
  const job = useVisionJob(props);
  const [language, setLanguage] = useState<ContentLanguage>('en');
  const [sample, setSample] = useState(500);
  const [confidence, setConfidence] = useState(0.5);
  const busy = Boolean(job.active);
  const hasOcr = Boolean(job.models?.ocr.available && job.models.ocr.languages.includes(language));
  const missing = job.models && (!job.models.ocr.available || !job.models.inpainting.available);

  return (
    <Section variant="transparent" padding={0} className="vision-panel" aria-label={t('visionTitle')}>
      <div className="action-row">
        <h2>{t('visionTitle')}</h2>
        <Button label={t('visionRefresh')} isDisabled={job.checking || busy}
          onClick={() => void job.refresh()} />
      </div>
      <p>{t('visionIntro')}</p>
      <p>{t('visionRange')}</p>
      <div className="vision-status" role="status">
        {job.checking ? t('visionChecking') : job.models && <>
          <span>OCR: {job.models.ocr.available ? t('visionConfigured')
            : t(visionErrorKey(job.models.ocr.code || 'MODEL_MISSING'))}</span>
          <span>LaMa: {job.models.inpainting.available ? t('visionConfigured')
            : t(visionErrorKey(job.models.inpainting.code || 'MODEL_MISSING'))}</span>
        </>}
      </div>
      {missing && <Banner status="warning" title={t('visionMissing')} description={t('visionSetup')} />}
      <Collapsible trigger={t('settingsProcessing')} defaultIsOpen={false}>
        <LocalModelSetup disabled={busy} />
      </Collapsible>
      <Selector label={t('visionLanguage')} value={language} isDisabled={busy} width={240}
        options={(['en', 'vi', 'zh'] as const).map(value => ({ value, label: t(`visionLanguage_${value}`) }))}
        onChange={value => { if (value === 'en' || value === 'vi' || value === 'zh') setLanguage(value); }} />
      {job.models?.ocr.available && !hasOcr && <Banner status="warning" title={t('visionLanguageMissing')} />}
      <div className="ocr-controls">
        <Collapsible trigger={t('visionOcrOptions')} defaultIsOpen={false}>
          <div className="vision-fields">
            <NumberInput label={t('visionSample')} min={100} max={2000} step={100} width={220}
              value={sample} isDisabled={busy} isWheelEnabled={false} isIntegerOnly onChange={setSample} />
            <NumberInput label={t('visionConfidence')} min={0} max={1} step={0.05} width={220}
              value={confidence} isDisabled={busy} isWheelEnabled={false} onChange={setConfidence} />
          </div>
        </Collapsible>
        <Button label={t('visionOcr')} variant="primary" isDisabled={busy || !hasOcr}
          onClick={() => void job.start('media.ocr', { language, sample_ms: sample, min_confidence: confidence })} />
        <Button label={t('visionExtractFull')} isDisabled={busy || !hasOcr}
          onClick={() => void job.start('media.ocr.extract', { language, sample_ms: sample, min_confidence: confidence })} />
        <p className="field-help">{t('visionExtractHelp')}</p>
      </div>
      <InpaintControls busy={busy} available={Boolean(job.models?.inpainting.available)} hasOcr={hasOcr}
        onStart={settings => job.start('media.inpaint', {
          ...settings, ...(settings.target === 'text' ? { language } : {}),
        })} />
      {job.active && <div className="action-row" role="status">
        <ProgressBar label={t(job.active.phase)} max={1} value={job.active.fraction ?? undefined}
          isIndeterminate={job.active.fraction === null} />
        <Button label={t('cancel')} isDisabled={job.active.phase === 'cancelling'}
          onClick={() => void job.cancel()} />
      </div>}
      {job.error && <Banner status="error" title={t(visionErrorKey(job.error))}
        description={<code>{job.error}</code>} />}
      <VisionResults assetId={props.assetId} revision={props.revision} busy={busy}
        draft={job.draft} output={job.output} onApply={props.onApply}
        onConsumed={job.consumeDraft} onError={job.report} />
    </Section>
  );
}
