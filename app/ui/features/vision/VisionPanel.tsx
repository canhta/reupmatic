import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { useTranslation } from 'react-i18next';
import { getTextLayer } from '../../../core/subtitles/layers/document';
import { useEditor } from '../editor/EditorContext';
import { LayerLanguageField } from '../editor/text-layers/LayerLanguageField';
import { visionErrorKey } from './error-message';
import { InpaintControls } from './InpaintControls';
import { useVisionJob, type VisionContext } from './useVisionJob';

type Props = VisionContext;

/**
 * The inspector's Clean up tab: OCR/object removal regions and options only. Getting subtitles
 * (OCR text extraction) moved to the Transcribe tool panel's on-screen-text section
 * (`OcrExtractGenerator`) — removal is a render step, not a way to get subtitles.
 */
export function VisionPanel(props: Props) {
  const { t } = useTranslation();
  const editor = useEditor();
  const job = useVisionJob(props);
  const displayed = getTextLayer(editor.textSnapshot, 'displayed');
  const language = displayed.language;
  const hasOcr = Boolean(
    language && job.models?.ocr.available && job.models.ocr.languages.includes(language),
  );
  const missing = job.models && (!job.models.ocr.available || !job.models.inpainting.available);

  return (
    <Section
      variant="transparent"
      padding={0}
      className="inspector-panel-section"
      aria-label={t('visionTitle')}
    >
      <div className="action-row">
        <div className="vision-status" role="status">
          {job.checking
            ? t('visionChecking')
            : job.models && (
                <Text type="body">
                  {t('settingsModelObjectRemoval')}:{' '}
                  {job.models.inpainting.available
                    ? t('visionConfigured')
                    : t(visionErrorKey(job.models.inpainting.code || 'MODEL_MISSING'))}
                </Text>
              )}
        </div>
        {missing && (
          <Button
            size="sm"
            variant="secondary"
            label={t('setUp')}
            onClick={() => void editor.openSettings('processing')}
          />
        )}
        <Button
          size="sm"
          label={t('visionRefresh')}
          isDisabled={editor.opening || job.checking}
          onClick={() => void job.refresh()}
        />
      </div>
      <LayerLanguageField
        layerName="displayed"
        language={language}
        isDisabled={editor.opening}
        onChange={(value) =>
          editor.changeLayerCues(displayed.cues, 'displayed', { language: value })
        }
      />
      {job.models?.ocr.available && !hasOcr && (
        <Banner status="warning" title={t('visionLanguageMissing')} />
      )}
      <InpaintControls
        processing={editor.processing}
        onChangeProcessing={editor.changeProcessing}
        language={language}
        available={Boolean(job.models?.inpainting.available)}
        hasOcr={hasOcr}
      />
      {job.error && (
        <Banner
          status="error"
          title={t(visionErrorKey(job.error))}
          description={<code>{job.error}</code>}
        />
      )}
    </Section>
  );
}
