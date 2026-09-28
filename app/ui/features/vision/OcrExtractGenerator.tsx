import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTextLayer } from '../../../core/subtitles/layers/document';
import { canApplyOcr } from '../../../core/vision/ocr-draft';
import { unwrap } from '../../bridge/client';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { InspectorPanelSection } from '../../design-system/InspectorPanelSection';
import { useEditor } from '../editor/EditorContext';
import { useEditorGenerators } from '../editor/EditorGeneratorContext';
import { GeneratorFooter } from '../editor/GeneratorFooter';
import { LayerLanguageField } from '../editor/text-layers/LayerLanguageField';
import { ReviewRows } from '../editor/text-layers/ReviewRows';
import { visionErrorKey } from './error-message';

export function OcrSetup() {
  const { t } = useTranslation();
  const editor = useEditor();
  const { vision: job, showReview } = useEditorGenerators();
  const displayed = getTextLayer(editor.textSnapshot, 'displayed');
  const language = displayed.language;
  const [sample, setSample] = useState(500);
  const [confidence, setConfidence] = useState(0.5);
  const busy = Boolean(job.active);
  const hasOcr = Boolean(
    language && job.models?.ocr.available && job.models.ocr.languages.includes(language),
  );
  const languageMissing = Boolean(
    language && job.models?.ocr.available && !job.models.ocr.languages.includes(language),
  );
  // No configured OCR model at all is a model problem regardless of language. Once a model is
  // configured, a language it doesn't cover is a model problem too — but no language chosen yet
  // is not: that belongs on the primary button's tooltip, not the Set up banner.
  const noModel = !job.models?.ocr.available;
  const modelBlocked = noModel || languageMissing;
  const modelReason = job.checking
    ? t('visionChecking')
    : modelBlocked
      ? t(visionErrorKey(job.models?.ocr.code || 'MODEL_MISSING'))
      : undefined;
  // Only the model earns the Set up Banner; the other blocking reasons ride on the button tooltip.
  const blockedTooltip = modelReason
    ? undefined
    : !language
      ? t('setLayerLanguageDisplayed')
      : editor.composition
        ? t('visionComposition')
        : undefined;

  return (
    <InspectorPanelSection title={t('visionExtractTitle')}>
      <Stack direction="vertical" gap={3}>
        {editor.composition && <Banner status="warning" title={t('visionComposition')} />}
        <FormLayout direction="vertical">
          <LayerLanguageField
            layerName="displayed"
            language={language}
            isDisabled={busy}
            onChange={(value) =>
              editor.changeLayerCues(displayed.cues, 'displayed', { language: value })
            }
          />
        </FormLayout>
        <Collapsible
          trigger={
            <Text type="body" weight="semibold">
              {t('visionOcrOptions')}
            </Text>
          }
          defaultIsOpen={false}
        >
          <Grid columns={2} gap={3}>
            <NumberInput
              label={t('visionSample')}
              units="ms"
              min={100}
              max={2000}
              step={100}
              width="100%"
              value={sample}
              isDisabled={busy}
              isWheelEnabled={false}
              isIntegerOnly
              onChange={setSample}
            />
            <NumberInput
              label={t('visionConfidence')}
              min={0}
              max={1}
              step={0.05}
              width="100%"
              value={confidence}
              isDisabled={busy}
              isWheelEnabled={false}
              onChange={setConfidence}
            />
          </Grid>
        </Collapsible>
        <GeneratorFooter
          readiness={{
            modelReason,
            checking: job.checking,
            canSetUp: modelBlocked,
            onSetUp: () => void editor.openSettings('processing'),
            onRefresh: () => void job.refresh(),
          }}
          active={job.active}
          error={job.error}
          errorLabel={t(visionErrorKey(job.error))}
          cancel={() => void job.cancel()}
        >
          <Button
            label={t('visionExtractFull')}
            variant="primary"
            width="100%"
            tooltip={blockedTooltip}
            isDisabled={busy || !hasOcr || !language || Boolean(editor.composition)}
            onClick={() => {
              if (!language) return;
              showReview('ocr');
              void job.start('media.ocr.extract', {
                language,
                sample_ms: sample,
                min_confidence: confidence,
              });
            }}
          />
        </GeneratorFooter>
      </Stack>
    </InspectorPanelSection>
  );
}

export function OcrReview() {
  const { t } = useTranslation();
  const editor = useEditor();
  const confirm = useConfirmation();
  const { vision: job } = useEditorGenerators();
  const media = editor.media;
  const [savedSrt, setSavedSrt] = useState('');
  const busy = Boolean(job.active);
  const draft = job.draft;
  const displayedToken = getTextLayer(editor.textSnapshot, 'displayed').token;
  const draftCurrent = Boolean(
    draft && media && canApplyOcr(draft.data, draft.token, media.asset_id, displayedToken),
  );
  if (!draft) return null;

  async function saveSrt() {
    if (!draft) return;
    try {
      const result = await unwrap<{ saved: boolean } | null>(
        window.reupmatic.saveSubtitles({
          asset_id: draft.data.asset_id,
          cues: draft.data.cues,
          timing: 'source',
        }),
      );
      if (result?.saved) setSavedSrt(draft.data.analysis_id);
    } catch (reason) {
      job.report(reason);
    }
  }

  async function apply() {
    if (!draft || !draftCurrent || busy) return;
    if (
      !(await confirm(t('visionApplyConfirm'), {
        title: t('confirmReplaceTitle'),
        confirmLabel: t('confirmReplaceAction'),
      }))
    )
      return;
    if (editor.applyOcr(draft.data, draft.token)) {
      job.consumeDraft(draft);
    }
  }

  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center" hAlign="between">
        <Heading level={5}>{t('visionDraft', { count: draft.data.cues.length })}</Heading>
        <IconButton
          label={t('cancel')}
          tooltip={t('cancel')}
          size="sm"
          variant="ghost"
          icon={<Icon icon="close" size="sm" />}
          onClick={() => job.consumeDraft(draft)}
        />
      </HStack>
      {savedSrt === draft.data.analysis_id && (
        <Text as="p" type="body" role="status">
          {t('visionSrtSaved')}
        </Text>
      )}
      {draft.data.scope === 'full-source' && (
        <Text as="p" type="body">
          {t('visionExtractEvidence', { count: draft.data.evidence?.observation_count })}
        </Text>
      )}
      {!draftCurrent && <Banner status="warning" title={t('visionDraftStale')} />}
      {!draft.data.cues.length ? (
        <EmptyState isCompact title={t('visionNoText')} />
      ) : (
        <ReviewRows
          ariaLabel={t('visionDraft', { count: draft.data.cues.length })}
          entries={draft.data.cues.slice(0, 200).map((cue) => ({
            key: cue.id,
            time: `${(cue.start_ms / 1000).toFixed(1)}–${(cue.end_ms / 1000).toFixed(1)}`,
            blocks: [{ key: 'text', text: cue.text, isPrimary: true }],
          }))}
        />
      )}
      <Collapsible trigger={t('visionEvidence')} defaultIsOpen={false}>
        <Text as="p" type="body">
          {t('visionEvidenceLimit')}
        </Text>
        <div className="vision-evidence">
          {draft.data.observations.slice(0, 20).map((item) => (
            <Text as="p" type="body" key={item.start_ms}>
              <Text className="numeric" hasTabularNumbers>
                {(item.start_ms / 1000).toFixed(2)} s
              </Text>
              {' · '}
              {item.detections.map((detection) => detection.text).join('\n') || '—'}
            </Text>
          ))}
        </div>
      </Collapsible>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Button
          label={t('visionExportSrt')}
          isDisabled={!draft.data.cues.length || busy}
          onClick={() => void saveSrt()}
        />
        <Button
          label={t('visionApply')}
          variant="primary"
          isDisabled={!draftCurrent || !draft.data.cues.length || busy}
          onClick={() => void apply()}
        />
      </HStack>
      {job.error && <Banner status="error" title={t(visionErrorKey(job.error))} />}
    </VStack>
  );
}
