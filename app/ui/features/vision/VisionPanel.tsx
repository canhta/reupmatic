import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import { getTextLayer } from '../../../core/subtitles/layers/document';
import { useEditor } from '../editor/EditorContext';
import { LayerLanguageField } from '../editor/text-layers/LayerLanguageField';
import { visionErrorKey } from './error-message';
import { InpaintControls } from './InpaintControls';
import { useVisionJob, type VisionContext } from './useVisionJob';

type Props = VisionContext;

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
    <Section variant="transparent" padding={0} aria-label={t('visionTitle')}>
      <VStack gap={3}>
        <LayerLanguageField
          layerName="displayed"
          language={language}
          isDisabled={editor.opening}
          onChange={(value) =>
            editor.changeLayerCues(displayed.cues, 'displayed', { language: value })
          }
        />
        <InpaintControls
          processing={editor.processing}
          onChangeProcessing={editor.changeProcessing}
          language={language}
          available={Boolean(job.models?.inpainting.available)}
          hasOcr={hasOcr}
        />
        <Text type="supporting" as="p">
          {t('visionInpaintExportOnly')}
        </Text>
        <HStack gap={3} vAlign="center" wrap="wrap" role="status">
          <Text type="body">
            {job.checking
              ? t('visionChecking')
              : job.models &&
                `${t('settingsModelObjectRemoval')}: ${
                  job.models.inpainting.available
                    ? t('visionConfigured')
                    : t(visionErrorKey(job.models.inpainting.code || 'MODEL_MISSING'))
                }`}
          </Text>
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
        </HStack>
        {job.models?.ocr.available && !hasOcr && (
          <Banner status="warning" title={t('visionLanguageMissing')} />
        )}
        {job.error && (
          <Banner
            status="error"
            title={t(visionErrorKey(job.error))}
            description={<code>{job.error}</code>}
          />
        )}
      </VStack>
    </Section>
  );
}
