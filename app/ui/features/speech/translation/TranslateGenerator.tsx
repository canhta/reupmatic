import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
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
import { CommandFooter, PanelRow, PanelRows, PanelSections } from '../../../design-system/Panel';
import { useEditor } from '../../editor/EditorContext';
import { useEditorGenerators } from '../../editor/EditorGeneratorContext';
import { GeneratorFooter } from '../../editor/GeneratorFooter';
import { DrawerFooter } from '../../editor/ToolDrawer';
import { LayerLanguageField } from '../../editor/text-layers/LayerLanguageField';
import { ReviewRows } from '../../editor/text-layers/ReviewRows';
import { engineName } from '../engine-name';
import { translationErrorKey } from './error-message';
import { TranslationRules } from './TranslationRules';

/** Captions › Create › Translate: the translation options, or its draft once one is ready. */
export function TranslateCreate({ isActive }: { isActive: boolean }) {
  const { translation: job } = useEditorGenerators();
  const [sourceLayer, setSourceLayer] = useState<TranslationSource>('transcript');
  const [to, setTo] = useState<TranslationLanguage>('vi');
  const [rules, setRules] = useState<TranslationRule[]>([]);
  if (!isActive) return null;
  const draft = job.draft;
  if (draft) {
    return (
      <TranslationDraftReview
        key={draft.input.request_id}
        draft={draft}
        disabled={Boolean(job.active) || job.settingUp}
        onDiscard={() => job.consume(draft)}
      />
    );
  }
  return (
    <TranslateSetup
      sourceLayer={sourceLayer}
      to={to}
      rules={rules}
      onSourceLayer={setSourceLayer}
      onTo={setTo}
      onRules={setRules}
    />
  );
}

function TranslateSetup({
  sourceLayer,
  to,
  rules,
  onSourceLayer,
  onTo,
  onRules,
}: {
  sourceLayer: TranslationSource;
  to: TranslationLanguage;
  rules: TranslationRule[];
  onSourceLayer: (layer: TranslationSource) => void;
  onTo: (language: TranslationLanguage) => void;
  onRules: (rules: TranslationRule[]) => void;
}) {
  const { t } = useTranslation();
  const editor = useEditor();
  const { translation: job, showReview } = useEditorGenerators();
  const busy = Boolean(job.active) || job.settingUp;
  const source = getTextLayer(editor.textSnapshot, sourceLayer);
  const from = source.language;
  const pairAvailable =
    job.models?.available &&
    from !== null &&
    job.models.source_language === from &&
    job.models.target_language === to;
  const modelReason =
    job.checking || !job.models?.available
      ? job.checking
        ? t('visionChecking')
        : t(translationErrorKey(job.models?.code || 'MODEL_MISSING'))
      : undefined;
  const blocked = source.stale
    ? t('textLayerStale')
    : !source.cues.length
      ? t('textLayerEmpty')
      : !pairAvailable
        ? t('translationPairMissing')
        : undefined;

  return (
    <>
      <PanelSections>
        <PanelRows>
          <Selector
            label={t('translationSource')}
            value={sourceLayer}
            isDisabled={busy}
            options={(['transcript', 'displayed'] as const).map((value) => ({
              value,
              label: t(`textLayer_${value}`),
            }))}
            onChange={(value) => {
              if (value === 'transcript' || value === 'displayed') onSourceLayer(value);
            }}
          />
          <LayerLanguageField
            language={from}
            isDisabled={busy}
            onChange={(value) =>
              editor.changeLayerCues(source.cues, sourceLayer, { language: value })
            }
          />
          <Selector
            label={t('translationTo')}
            value={to}
            isDisabled={busy}
            options={(['en', 'vi', 'zh'] as const).map((value) => ({
              value,
              label: t(`visionLanguage_${value}`),
            }))}
            onChange={(value) => {
              if (value === 'en' || value === 'vi' || value === 'zh') onTo(value);
            }}
          />
        </PanelRows>
        <TranslationRules rules={rules} onChange={onRules} disabled={busy} />
      </PanelSections>
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
        primary={{
          label: t('captionCreate'),
          isDisabled:
            busy || editor.opening || !pairAvailable || source.stale || !source.cues.length,
          blocked,
          onClick: () => {
            if (!from) return;
            showReview('translate');
            void job.start({
              source_layer: sourceLayer,
              source_language: from,
              target_language: to,
              rules,
            });
          },
        }}
      />
    </>
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
      <Text as="p" type="body">
        {t('translationCaptured', {
          source: t(`textLayer_${p.source_layer}`),
          from: t(`visionLanguage_${p.source_language}`),
          to: t(`visionLanguage_${p.target_language}`),
          count: p.cues.length,
          rules: p.rules.length,
          engine: engineName(draft.result.runtime),
        })}
      </Text>
      <PanelRows>
        <PanelRow label={t('translationPolicy')}>
          <SegmentedControl
            label={t('translationPolicy')}
            value={policy}
            size="sm"
            layout="fill"
            isDisabled={disabled}
            onChange={(value) => {
              if (value !== 'keep-existing' && value !== 'replace-all') return;
              setPolicy(value);
              setReviewed(compute(value));
              setConfirmed(false);
            }}
          >
            <SegmentedControlItem value="keep-existing" label={t('translationKeep')} />
            <SegmentedControlItem value="replace-all" label={t('translationReplace')} />
          </SegmentedControl>
        </PanelRow>
      </PanelRows>
      {requiresConfirmation && (
        <CheckboxInput label={t('translationConfirm')} value={confirmed} onChange={setConfirmed} />
      )}
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
        </>
      )}
      <DrawerFooter>
        <CommandFooter
          status={
            error
              ? { tone: 'error', text: t(translationErrorKey(error)) }
              : preview && !fresh
                ? { tone: 'warning', text: t('translationSourceChanged') }
                : null
          }
        >
          <Button label={t('draftDiscard')} onClick={onDiscard} />
          {fresh ? (
            <Button
              label={t('draftApply')}
              variant="primary"
              isDisabled={
                !fresh || disabled || editor.opening || (requiresConfirmation && !confirmed)
              }
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
          ) : (
            // Out of date, reviewing again is the only way forward, so it takes Apply's place.
            <Button
              label={t('speechReview')}
              variant="primary"
              isDisabled={disabled || editor.opening}
              onClick={review}
            />
          )}
        </CommandFooter>
      </DrawerFooter>
    </VStack>
  );
}
