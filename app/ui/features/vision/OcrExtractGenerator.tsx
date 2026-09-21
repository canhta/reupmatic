import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Selector } from '@astryxdesign/core/Selector';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTextLayer } from '../../../core/subtitles/layers/document';
import { canApplyOcr } from '../../../core/vision/ocr-draft';
import { unwrap } from '../../bridge/client';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { InspectorPanelSection } from '../../design-system/InspectorPanelSection';
import { useEditor } from '../editor/EditorContext';
import { useEditorGenerators } from '../editor/EditorGeneratorContext';
import { LayerLanguageField } from '../editor/text-layers/LayerLanguageField';
import { ReviewRows } from '../editor/text-layers/ReviewRows';
import { visionErrorKey } from './error-message';

/**
 * On-screen text extraction's setup form, resident in the Transcribe tool
 * panel's second section (ED-P01, ticket 02). Sampling interval and confidence
 * are collapsed advanced options. Running it produces the review `CuePanel`
 * renders in the cue column; the job lives in `EditorGeneratorsProvider`.
 */
export function OcrSetup() {
  const { t } = useTranslation();
  const editor = useEditor();
  const { vision: job, showReview } = useEditorGenerators();
  const displayed = getTextLayer(editor.textSnapshot, 'displayed');
  const language = displayed.language;
  const [sample, setSample] = useState(500);
  const [confidence, setConfidence] = useState(0.5);
  const [scope, setScope] = useState<'sample' | 'full'>('sample');
  const busy = Boolean(job.active);
  const hasOcr = Boolean(
    language && job.models?.ocr.available && job.models.ocr.languages.includes(language),
  );

  return (
    <InspectorPanelSection title={t('visionExtractTitle')}>
      <Stack direction="vertical" gap={3}>
        {/* Status and setup are separate block rows, exactly as the Voice panel
            lays them out: the Set up action shares the column's left edge
            instead of sitting beside the status line. */}
        {(job.checking || !job.models?.ocr.available) && (
          <>
            <Text as="p" display="block" type="body" role="status">
              {job.checking
                ? t('visionChecking')
                : t(visionErrorKey(job.models?.ocr.code || 'MODEL_MISSING'))}
            </Text>
            <div className="action-row">
              {job.models && !job.models.ocr.available && (
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
                isDisabled={busy || job.checking}
                onClick={() => void job.refresh()}
              />
            </div>
          </>
        )}
        <div className="business-toolbar">
          <LayerLanguageField
            layerName="displayed"
            language={language}
            isDisabled={busy}
            onChange={(value) =>
              editor.changeLayerCues(displayed.cues, 'displayed', { language: value })
            }
          />
          <Selector
            label={t('speechScope')}
            value={scope}
            isDisabled={busy}
            options={[
              { value: 'sample', label: t('speechSample') },
              { value: 'full', label: t('speechFull') },
            ]}
            onChange={(value) => {
              if (value === 'sample' || value === 'full') setScope(value);
            }}
          />
        </div>
        <Collapsible
          trigger={
            <Text type="label" weight="semibold">
              {t('visionOcrOptions')}
            </Text>
          }
          defaultIsOpen={false}
        >
          <div className="vision-fields">
            <NumberInput
              label={t('visionSample')}
              min={100}
              max={2000}
              step={100}
              width={220}
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
              width={220}
              value={confidence}
              isDisabled={busy}
              isWheelEnabled={false}
              onChange={setConfidence}
            />
          </div>
        </Collapsible>
        {job.active && (
          <div className="action-row" role="status">
            <ProgressBar
              label={t(job.active.phase)}
              max={1}
              value={job.active.fraction ?? undefined}
              isIndeterminate={job.active.fraction === null}
            />
            <Button
              label={t('cancel')}
              isDisabled={job.active.phase === 'cancelling'}
              onClick={() => void job.cancel()}
            />
          </div>
        )}
        {job.error && (
          <Banner
            status="error"
            title={t(visionErrorKey(job.error))}
            description={<code>{job.error}</code>}
          />
        )}
        <div className="action-row">
          <Button
            label={t('visionExtractFull')}
            variant="primary"
            isDisabled={busy || !hasOcr || !language}
            onClick={() => {
              if (!language) return;
              showReview('ocr');
              void job.start(scope === 'full' ? 'media.ocr.extract' : 'media.ocr', {
                language,
                sample_ms: sample,
                min_confidence: confidence,
              });
            }}
          />
        </div>
      </Stack>
    </InspectorPanelSection>
  );
}

/**
 * The result of an OCR run, rendered in the cue column until accepted or
 * discarded. `canApplyOcr` keeps a stale scan from overwriting later edits.
 */
export function OcrReview() {
  const { t } = useTranslation();
  const editor = useEditor();
  const confirm = useConfirmation();
  const { vision: job } = useEditorGenerators();
  const media = editor.media;
  const [savedSrt, setSavedSrt] = useState('');
  const busy = Boolean(job.active);
  const draft = job.draft;
  const draftCurrent = Boolean(
    draft && media && canApplyOcr(draft.data, draft.revision, media.asset_id, editor.getRevision()),
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
    if (!(await confirm(t('visionApplyConfirm')))) return;
    if (editor.applyOcr(draft.data, draft.revision)) {
      job.consumeDraft(draft);
    }
  }

  return (
    <div className="generator-review">
      <div className="action-row">
        <Heading level={5}>{t('visionDraft', { count: draft.data.cues.length })}</Heading>
        <IconButton
          label={t('cancel')}
          tooltip={t('cancel')}
          size="sm"
          variant="ghost"
          icon={<Icon icon="close" size="sm" />}
          onClick={() => job.consumeDraft(draft)}
        />
      </div>
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
      <Collapsible
        trigger={
          <Text type="label" weight="semibold">
            {t('visionEvidence')}
          </Text>
        }
        defaultIsOpen={false}
      >
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
      <div className="action-row">
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
      </div>
      {job.error && (
        <Banner
          status="error"
          title={t(visionErrorKey(job.error))}
          description={<code>{job.error}</code>}
        />
      )}
    </div>
  );
}
