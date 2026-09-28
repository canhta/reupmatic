import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { List, ListItem } from '@astryxdesign/core/List';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTextLayer } from '../../../core/subtitles/layers/document';
import { canApplyOcr } from '../../../core/vision/ocr-draft';
import { unwrap } from '../../bridge/client';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { CommandFooter, PanelRows, PanelSection, SliderRow } from '../../design-system/Panel';
import { useEditor } from '../editor/EditorContext';
import { useEditorGenerators } from '../editor/EditorGeneratorContext';
import { GeneratorFooter } from '../editor/GeneratorFooter';
import { DrawerFooter } from '../editor/ToolDrawer';
import { LayerLanguageField } from '../editor/text-layers/LayerLanguageField';
import { ReviewRows } from '../editor/text-layers/ReviewRows';
import { visionErrorKey } from './error-message';

/** Captions › Create › Screen: on-screen text options, or the OCR draft once one is ready. */
export function ScreenCreate({ isActive }: { isActive: boolean }) {
  const { vision: job } = useEditorGenerators();
  const [sample, setSample] = useState(500);
  const [confidence, setConfidence] = useState(0.5);
  if (!isActive) return null;
  return job.draft ? (
    <OcrReview />
  ) : (
    <OcrSetup
      sample={sample}
      confidence={confidence}
      onSample={setSample}
      onConfidence={setConfidence}
    />
  );
}

function OcrSetup({
  sample,
  confidence,
  onSample,
  onConfidence,
}: {
  sample: number;
  confidence: number;
  onSample: (ms: number) => void;
  onConfidence: (value: number) => void;
}) {
  const { t } = useTranslation();
  const editor = useEditor();
  const { vision: job, showReview } = useEditorGenerators();
  const displayed = getTextLayer(editor.textSnapshot, 'displayed');
  const language = displayed.language;
  const busy = Boolean(job.active);
  const hasOcr = Boolean(
    language && job.models?.ocr.available && job.models.ocr.languages.includes(language),
  );
  const languageMissing = Boolean(
    language && job.models?.ocr.available && !job.models.ocr.languages.includes(language),
  );
  // No configured OCR model at all is a model problem regardless of language. Once a model is
  // configured, a language it doesn't cover is a model problem too — but no language chosen yet
  // is not: that is why the command waits, not a Set up.
  const noModel = !job.models?.ocr.available;
  const modelBlocked = noModel || languageMissing;
  const modelReason = job.checking
    ? t('visionChecking')
    : modelBlocked
      ? t(visionErrorKey(job.models?.ocr.code || 'MODEL_MISSING'))
      : undefined;
  const blocked = !language
    ? t('captionNeedLanguage')
    : editor.composition
      ? t('visionComposition')
      : undefined;

  return (
    <>
      <PanelRows>
        <LayerLanguageField
          language={language}
          isDisabled={busy}
          onChange={(value) =>
            editor.changeLayerCues(displayed.cues, 'displayed', { language: value })
          }
        />
        <NumberInput
          label={t('visionSample')}
          units="s"
          min={0.1}
          max={2}
          step={0.1}
          value={sample / 1000}
          isDisabled={busy}
          isWheelEnabled={false}
          onChange={(seconds) => onSample(Math.round(seconds * 1000))}
        />
        <SliderRow
          label={t('visionConfidence')}
          units="%"
          min={0}
          max={100}
          step={5}
          value={Math.round(confidence * 100)}
          isDisabled={busy}
          onChange={(percent) => onConfidence(percent / 100)}
        />
      </PanelRows>
      <GeneratorFooter
        readiness={{
          unavailable: editor.composition ? t('visionComposition') : undefined,
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
        primary={{
          label: t('captionCreate'),
          isDisabled: busy || !hasOcr || !language || Boolean(editor.composition),
          blocked,
          onClick: () => {
            if (!language) return;
            showReview('ocr');
            void job.start('media.ocr.extract', {
              language,
              sample_ms: sample,
              min_confidence: confidence,
            });
          },
        }}
      />
    </>
  );
}

function OcrReview() {
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
    if (editor.applyOcr(draft.data, draft.token)) job.consumeDraft(draft);
  }

  return (
    <VStack gap={4}>
      <Text as="p" type="body" role="status">
        {t('visionDraft', { count: draft.data.cues.length })}
      </Text>
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
      <PanelSection title={t('visionEvidence')}>
        <Text as="p" type="body">
          {t('visionExtractEvidence', { count: draft.data.evidence?.observation_count })}
        </Text>
        <List density="compact" hasDividers aria-label={t('visionEvidence')}>
          {draft.data.observations.slice(0, 20).map((item) => (
            <ListItem
              key={item.start_ms}
              label={`${(item.start_ms / 1000).toFixed(2)} s`}
              description={
                <Text type="body" className="rule-comparison-text">
                  {item.detections.map((detection) => detection.text).join('\n') || '—'}
                </Text>
              }
            />
          ))}
        </List>
      </PanelSection>
      <DrawerFooter>
        <CommandFooter
          status={
            job.error
              ? { tone: 'error', text: t(visionErrorKey(job.error)) }
              : !draftCurrent
                ? { tone: 'warning', text: t('visionDraftStale') }
                : savedSrt === draft.data.analysis_id
                  ? { tone: 'success', text: t('visionSrtSaved') }
                  : null
          }
          menu={[
            {
              label: t('visionExportSrt'),
              isDisabled: !draft.data.cues.length || busy,
              onClick: () => void saveSrt(),
            },
          ]}
        >
          <Button label={t('draftDiscard')} onClick={() => job.consumeDraft(draft)} />
          <Button
            label={t('draftApply')}
            variant="primary"
            isDisabled={!draftCurrent || !draft.data.cues.length || busy}
            onClick={() => void apply()}
          />
        </CommandFooter>
      </DrawerFooter>
    </VStack>
  );
}
