import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { HStack } from '@astryxdesign/core/HStack';
import { Section } from '@astryxdesign/core/Section';
import { Selector } from '@astryxdesign/core/Selector';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
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
import { cueQcFlags } from '../../../../core/subtitles/qc';
import { useEditor } from '../../editor/EditorContext';
import { useEditorGenerators } from '../../editor/EditorGeneratorContext';
import { GeneratorFooter } from '../../editor/GeneratorFooter';
import { LayerLanguageField } from '../../editor/text-layers/LayerLanguageField';
import { ReviewRows } from '../../editor/text-layers/ReviewRows';
import { engineName } from '../engine-name';
import { translationErrorKey } from './error-message';
import { TranslationRules } from './TranslationRules';

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
  const modelReason =
    job.checking || !job.models?.available
      ? job.checking
        ? t('visionChecking')
        : t(translationErrorKey(job.models?.code || 'MODEL_MISSING'))
      : undefined;
  // Only the model earns the Set up Banner; the other blocking reasons ride on the button tooltip.
  const blockedTooltip = modelReason
    ? undefined
    : source.stale
      ? t('textLayerStale')
      : !source.cues.length
        ? t('textLayerEmpty')
        : !pairAvailable
          ? t('translationPairMissing')
          : undefined;

  return (
    <Section variant="transparent" padding={0} aria-label={t('translationTitle')}>
      <Stack direction="vertical" gap={3}>
        <FormLayout direction="vertical">
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
        </FormLayout>
        {!source.cues.length && (
          <Text as="p" display="block" type="body" role="status">
            {t('textLayerEmpty')}
          </Text>
        )}
        {source.stale && <Banner status="warning" title={t('textLayerStale')} />}
        <TranslationRules rules={rules} onChange={setRules} disabled={busy} />
        <GeneratorFooter
          readiness={{
            modelReason,
            checking: job.checking,
            canSetUp: Boolean(job.models && !job.models.available),
            onSetUp: () => void editor.openSettings('processing'),
            onRefresh: () => void job.refresh(),
          }}
          active={job.active}
          error={job.error}
          errorLabel={t(translationErrorKey(job.error))}
          cancel={() => void job.cancel()}
        >
          <Button
            label={t('translationStart')}
            variant="primary"
            width="100%"
            tooltip={blockedTooltip}
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
        </GeneratorFooter>
      </Stack>
    </Section>
  );
}

export function TranslateReview() {
  const { translation: job } = useEditorGenerators();
  const draft = job.draft;
  if (!draft) return null;
  const busy = Boolean(job.active) || job.settingUp;
  return (
    <TranslationDraftReview
      key={draft.input.request_id}
      draft={draft}
      disabled={busy}
      onDiscard={() => job.consume(draft)}
    />
  );
}

type ReviewedTranslation = { value: TranslationPreview; revision: number } | { error: string };

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
  const [confirmed, setConfirmed] = useState(false);
  const p = draft.input.params;

  function compute(nextPolicy: TranslationPolicy): ReviewedTranslation {
    try {
      if (draft.documentId !== editor.documentId) throw new Error('STALE_OPERATION');
      return {
        value: previewTranslation(editor.textSnapshot, draft.input, draft.result, nextPolicy),
        revision: editor.getRevision(),
      };
    } catch (reason) {
      return { error: reason instanceof Error ? reason.message : 'STALE_OPERATION' };
    }
  }

  // The comparison is pure, so it renders with the draft instead of behind a second Review step.
  const [reviewed, setReviewed] = useState<ReviewedTranslation>(() => compute('keep-existing'));
  const preview = 'value' in reviewed ? reviewed.value : null;
  const error = 'error' in reviewed ? reviewed.error : '';
  const fresh =
    'value' in reviewed &&
    reviewed.revision === editor.revision &&
    draft.documentId === editor.documentId;
  const before = new Map(preview?.before.map((cue) => [cue.id, cue]) ?? []);
  const source = new Map(p.cues.map((cue) => [cue.id, cue]));
  const generated = new Map(draft.result.cues.map((cue) => [cue.id, cue]));
  const after = new Map(preview?.cues.map((cue) => [cue.id, cue]) ?? []);
  const ids = [...new Set([...source.keys(), ...before.keys()])];
  const requiresConfirmation = policy === 'replace-all' && Boolean(preview?.before.length);

  function review() {
    setReviewed(compute(policy));
    setConfirmed(false);
  }

  return (
    <VStack gap={3}>
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
      <Text as="p" display="block" type="body">
        {t('translationCapturedHelp')}
      </Text>
      <Selector
        label={t('translationPolicy')}
        value={policy}
        width="100%"
        isDisabled={disabled}
        options={[
          {
            value: 'keep-existing',
            label: t('translationKeep'),
            description: t('translationKeepHelp'),
          },
          {
            value: 'replace-all',
            label: t('translationReplace'),
            description: t('translationReplaceHelp'),
          },
        ]}
        onChange={(value) => {
          if (value !== 'keep-existing' && value !== 'replace-all') return;
          setPolicy(value);
          setReviewed(compute(value));
          setConfirmed(false);
        }}
      />
      {error && <Banner status="error" title={t(translationErrorKey(error))} />}
      {preview && (
        <>
          <Text as="p" type="body" role="status">
            {t('translationCounts', {
              kept: preview.kept,
              added: preview.added,
              replaced: preview.replaced,
              removed: preview.removed,
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
              const afterCue = after.get(id);
              const overSpeed = Boolean(
                afterCue &&
                  cueQcFlags(afterCue, editor.lineLengthThresholds(afterCue.text)).includes(
                    'too-fast',
                  ),
              );
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
                    label: overSpeed ? t('translationOverSpeed') : t('translationAfter'),
                    text: afterCue?.text ?? '—',
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
        </>
      )}
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Button label={t('translationDiscard')} onClick={onDiscard} />
        {!fresh && (
          <Button
            label={t('translationReview')}
            isDisabled={disabled || editor.opening}
            onClick={review}
          />
        )}
        <Button
          label={t('translationApply')}
          variant="primary"
          isDisabled={!fresh || disabled || editor.opening || (requiresConfirmation && !confirmed)}
          onClick={() => {
            if (!('value' in reviewed)) return;
            try {
              editor.applyTranslation(reviewed.value, reviewed.revision);
              onDiscard();
            } catch (reason) {
              setReviewed({
                error: reason instanceof Error ? reason.message : 'STALE_OPERATION',
              });
            }
          }}
        />
      </HStack>
    </VStack>
  );
}
