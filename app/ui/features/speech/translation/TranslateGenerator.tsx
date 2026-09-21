import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Section } from '@astryxdesign/core/Section';
import { Selector } from '@astryxdesign/core/Selector';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  previewTranslation,
  type TranslationPreview,
} from '../../../../core/speech/translation/review';
import type {
  TranslationLanguage,
  TranslationPolicy,
  TranslationRule,
  TranslationSource,
} from '../../../../core/speech/translation/rules';
import { getTextLayer } from '../../../../core/subtitles/layers/document';
import { useEditor } from '../../editor/EditorContext';
import { useEditorGenerators } from '../../editor/EditorGeneratorContext';
import { LayerLanguageField } from '../../editor/text-layers/LayerLanguageField';
import { ReviewRows } from '../../editor/text-layers/ReviewRows';
import { engineName } from '../engine-name';
import { translationErrorKey } from './error-message';
import { TranslationRules } from './TranslationRules';

/**
 * Translation's setup form, resident in the Translate tool panel (ED-P01,
 * ticket 02): source layer → target layer, rules collapsed. Running it
 * produces the source/target review `CuePanel` renders in the cue column; the
 * job lives in `EditorGeneratorsProvider`. The result stays a separate layer.
 */
export function TranslateSetup() {
  const { t } = useTranslation();
  const editor = useEditor();
  const { translation: job, showReview } = useEditorGenerators();
  const [sourceLayer, setSourceLayer] = useState<TranslationSource>('transcript');
  const [to, setTo] = useState<TranslationLanguage>('vi');
  const [rules, setRules] = useState<TranslationRule[]>([]);
  const busy = Boolean(job.active) || job.settingUp;
  const source = getTextLayer(editor.textSnapshot, sourceLayer);
  const from = source.language;
  const pairAvailable =
    job.models?.available &&
    from !== null &&
    job.models.source_language === from &&
    job.models.target_language === to;
  const languages = (['en', 'vi', 'zh'] as const).map((value) => ({
    value,
    label: t(`visionLanguage_${value}`),
  }));

  return (
    // No visible heading: the tool panel header already names this panel
    // "Translate", so a section title repeating it duplicates the container
    // (UI-T04), exactly as SubtitleStylesPanel handles Style.
    <Section
      variant="transparent"
      padding={0}
      className="inspector-panel-section"
      aria-label={t('translationTitle')}
    >
      <Stack direction="vertical" gap={3}>
        {(job.checking || !job.models?.available) && (
          <>
            <Text as="p" display="block" type="body" role="status">
              {job.checking
                ? t('visionChecking')
                : t(translationErrorKey(job.models?.code || 'MODEL_MISSING'))}
            </Text>
            <div className="action-row">
              {job.models && !job.models.available && (
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
          <Selector
            label={t('translationSource')}
            value={sourceLayer}
            isDisabled={busy}
            options={(['transcript', 'displayed'] as const).map((value) => ({
              value,
              label: t(`textLayer_${value}`),
            }))}
            onChange={(value) => {
              if (value === 'transcript' || value === 'displayed') setSourceLayer(value);
            }}
          />
          <LayerLanguageField
            layerName={sourceLayer}
            language={from}
            isDisabled={busy}
            onChange={(value) =>
              editor.changeLayerCues(source.cues, sourceLayer, { language: value })
            }
          />
          <Selector
            label={t('translationTo')}
            value={to}
            options={languages}
            isDisabled={busy}
            onChange={(value) => {
              if (value === 'en' || value === 'vi' || value === 'zh') setTo(value);
            }}
          />
        </div>
        {!source.cues.length && (
          <Text as="p" display="block" type="body" role="status">
            {t('textLayerEmpty')}
          </Text>
        )}
        {source.stale && <Banner status="warning" title={t('textLayerStale')} />}
        <TranslationRules rules={rules} onChange={setRules} disabled={busy} />
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
            title={t(translationErrorKey(job.error))}
            description={<code>{job.error}</code>}
          />
        )}
        <div className="action-row">
          <Button
            label={t('translationStart')}
            variant="primary"
            isDisabled={
              busy || editor.opening || !pairAvailable || source.stale || !source.cues.length
            }
            onClick={() => {
              if (!from) return;
              showReview('translate');
              void job.start({
                source_layer: sourceLayer,
                source_language: from,
                target_language: to,
                rules,
              });
            }}
          />
        </div>
      </Stack>
    </Section>
  );
}

/**
 * The translation result review, rendered in the cue column. It keeps the
 * comparison and the replace-all confirmation before the generated text can
 * overwrite manual edits (ED-SUB-P01).
 */
export function TranslateReview() {
  const { translation: job } = useEditorGenerators();
  const draft = job.draft;
  if (!draft) return null;
  const busy = Boolean(job.active) || job.settingUp;
  return (
    <TranslationDraftReview draft={draft} disabled={busy} onDiscard={() => job.consume(draft)} />
  );
}

function TranslationDraftReview({
  draft,
  disabled,
  onDiscard,
}: {
  draft: NonNullable<ReturnType<typeof useEditorGenerators>['translation']['draft']>;
  disabled: boolean;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const editor = useEditor();
  const [policy, setPolicy] = useState<TranslationPolicy>('keep-existing');
  const [preview, setPreview] = useState<{ value: TranslationPreview; revision: number } | null>(
    null,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const p = draft.input.params;
  const fresh =
    preview && preview.revision === editor.revision && draft.documentId === editor.documentId;
  const before = new Map(preview?.value.before.map((cue) => [cue.id, cue]) ?? []);
  const source = new Map(p.cues.map((cue) => [cue.id, cue]));
  const generated = new Map(draft.result.cues.map((cue) => [cue.id, cue]));
  const after = new Map(preview?.value.cues.map((cue) => [cue.id, cue]) ?? []);
  const ids = [...new Set([...source.keys(), ...before.keys()])];
  const requiresConfirmation = policy === 'replace-all' && Boolean(preview?.value.before.length);

  function review() {
    setPreview(null);
    setConfirmed(false);
    try {
      if (draft.documentId !== editor.documentId) throw new Error('STALE_OPERATION');
      setPreview({
        value: previewTranslation(editor.textSnapshot, draft.input, draft.result, policy),
        revision: editor.getRevision(),
      });
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'STALE_OPERATION');
    }
  }

  return (
    <div className="generator-review">
      <div className="action-row">
        <Heading level={5}>{t('translationDraft')}</Heading>
        <IconButton
          label={t('cancel')}
          tooltip={t('cancel')}
          size="sm"
          variant="ghost"
          icon={<Icon icon="close" size="sm" />}
          onClick={onDiscard}
        />
      </div>
      <Text as="p" display="block" type="body">
        {t('translationCaptured', {
          source: t(`textLayer_${p.source_layer}`),
          from: t(`visionLanguage_${p.source_language}`),
          to: t(`visionLanguage_${p.target_language}`),
          count: p.cues.length,
          rules: p.rules.length,
          engine: engineName(draft.result.runtime),
        })}
      </Text>
      <Text as="p" display="block" type="supporting">
        {t('translationCapturedHelp')}
      </Text>
      <RadioList
        label={t('translationPolicy')}
        value={policy}
        onChange={(value) => {
          if (value === 'keep-existing' || value === 'replace-all') {
            setPolicy(value);
            setPreview(null);
            setConfirmed(false);
          }
        }}
      >
        <RadioListItem
          value="keep-existing"
          label={t('translationKeep')}
          description={t('translationKeepHelp')}
        />
        <RadioListItem
          value="replace-all"
          label={t('translationReplace')}
          description={t('translationReplaceHelp')}
        />
      </RadioList>
      <Button
        label={t('translationReview')}
        isDisabled={disabled || editor.opening}
        onClick={review}
      />
      {error && (
        <Banner
          status="error"
          title={t(translationErrorKey(error))}
          description={<code>{error}</code>}
        />
      )}
      {preview && (
        <>
          <Text as="p" type="body" role="status">
            {t('translationCounts', {
              kept: preview.value.kept,
              added: preview.value.added,
              replaced: preview.value.replaced,
              removed: preview.value.removed,
            })}
          </Text>
          {!fresh && (
            <Banner
              status="warning"
              title={t('rulesStale')}
              description={t('translationStaleHelp')}
            />
          )}
          <ReviewRows
            ariaLabel={t('translationComparison')}
            entries={ids.map((id) => {
              const sourceCue = source.get(id) ?? before.get(id);
              return {
                key: id,
                time: sourceCue ? `${sourceCue.start_ms / 1000}–${sourceCue.end_ms / 1000}` : '—',
                blocks: [
                  {
                    key: 'source',
                    label: t('translationSource'),
                    text: source.get(id)?.text ?? '—',
                  },
                  { key: 'before', label: t('rulesBefore'), text: before.get(id)?.text ?? '—' },
                  {
                    key: 'generated',
                    label: t('translationGenerated'),
                    text: generated.get(id)?.text ?? '—',
                  },
                  {
                    key: 'after',
                    label: t('translationAfter'),
                    text: after.get(id)?.text ?? '—',
                    isPrimary: true,
                  },
                ],
              };
            })}
          />
          {requiresConfirmation && (
            <CheckboxInput
              label={t('translationConfirm')}
              value={confirmed}
              onChange={setConfirmed}
            />
          )}
          <div className="action-row">
            <Button label={t('translationDiscard')} onClick={onDiscard} />
            <Button
              label={t('translationApply')}
              variant="primary"
              isDisabled={
                !fresh || disabled || editor.opening || (requiresConfirmation && !confirmed)
              }
              onClick={() => {
                try {
                  editor.applyTranslation(preview.value, preview.revision);
                  onDiscard();
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : 'STALE_OPERATION');
                }
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
