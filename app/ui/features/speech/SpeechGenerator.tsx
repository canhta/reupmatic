import { Button } from '@astryxdesign/core/Button';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { speechDraftFresh } from '../../../core/speech/draft-freshness';
import {
  offeredSpeechEngines,
  presentableSpeechEngines,
} from '../../../core/speech/engine-capability';
import { getTextLayer } from '../../../core/subtitles/layers/document';
import { CHINESE_CPS, LATIN_CPS, type LineLengthSettings } from '../../../core/subtitles/split';
import { CommandFooter, PanelRow, PanelRows } from '../../design-system/Panel';
import { useEditor } from '../editor/EditorContext';
import { useEditorGenerators } from '../editor/EditorGeneratorContext';
import { GeneratorFooter } from '../editor/GeneratorFooter';
import { DrawerFooter } from '../editor/ToolDrawer';
import { LayerLanguageField } from '../editor/text-layers/LayerLanguageField';
import { ReviewRows } from '../editor/text-layers/ReviewRows';
import { speechErrorKey } from './error-message';
import { problemCode } from './useSpeechJob';

/** Captions › Create › Speech: the transcript's options, or its draft once one is ready. */
export function SpeechCreate({ isActive }: { isActive: boolean }) {
  const { speech: job } = useEditorGenerators();
  const [engineId, setEngineId] = useState<string | null>(null);
  if (!isActive) return null;
  return job.draft ? <SpeechReview /> : <SpeechSetup engineId={engineId} onEngine={setEngineId} />;
}

function SpeechSetup({
  engineId,
  onEngine,
}: {
  engineId: string | null;
  onEngine: (engine: string | null) => void;
}) {
  const { t } = useTranslation();
  const editor = useEditor();
  const { speech: job, showReview } = useEditorGenerators();
  const media = editor.media;
  const transcript = getTextLayer(editor.textSnapshot, 'transcript');
  const language = transcript.language;
  const busy = Boolean(job.active) || job.settingUp;
  const engines = useMemo(
    () => (job.models && language ? offeredSpeechEngines(job.models, language) : []),
    [job.models, language],
  );
  useEffect(() => {
    if (!engines.some((entry) => entry.engine === engineId)) onEngine(engines[0]?.engine ?? null);
  }, [engines, engineId, onEngine]);
  const available = engines.length > 0;
  // No usable engine anywhere is a model problem regardless of language. Once a model is
  // configured, missing engines for the chosen language become a model problem too — but choosing
  // no language yet is not: that is why the command waits, not a Set up.
  const anyEngineAvailable = Boolean(job.models && presentableSpeechEngines(job.models).length);
  const modelBlocked = !anyEngineAvailable || (language !== null && !available);
  const modelReason = job.checking
    ? t('visionChecking')
    : modelBlocked
      ? t(speechErrorKey(problemCode(job.models, language)))
      : undefined;
  const blocked = !language
    ? t('captionNeedLanguage')
    : editor.composition
      ? t('speechComposition')
      : !media?.has_audio
        ? t('speechNoAudio')
        : undefined;

  return (
    <>
      <PanelRows>
        <LayerLanguageField
          language={language}
          isDisabled={busy}
          onChange={(value) =>
            editor.changeLayerCues(transcript.cues, 'transcript', { language: value })
          }
        />
        {engines.length > 1 && (
          <Selector
            label={t('speechEngine')}
            value={engineId ?? ''}
            isDisabled={busy}
            options={engines.map((entry) => ({ value: entry.engine, label: entry.engine }))}
            onChange={(value) => {
              if (value) onEngine(value);
            }}
          />
        )}
        <LineLengthRows busy={busy} />
      </PanelRows>
      <GeneratorFooter
        readiness={{
          unavailable: editor.composition ? t('speechComposition') : undefined,
          modelReason,
          checking: job.checking,
          canSetUp: modelBlocked,
          onSetUp: () => void editor.openSettings('processing'),
          onRefresh: () => void job.refresh(),
        }}
        active={job.active}
        error={job.error}
        errorLabel={t(speechErrorKey(job.error))}
        menu={[
          {
            label: t('lineLengthResplit'),
            isDisabled: busy || editor.opening || !transcript.cues.length,
            onClick: () => {
              try {
                editor.resplitTranscript();
              } catch (reason) {
                job.report(reason);
              }
            },
          },
        ]}
        notice={editor.transcriptNeedsResplit ? t('lineLengthStale') : undefined}
        cancel={() => void job.cancel()}
        primary={{
          label: t('captionCreate'),
          isDisabled:
            busy ||
            editor.opening ||
            !available ||
            !engineId ||
            !language ||
            !media?.has_audio ||
            Boolean(editor.composition),
          blocked,
          onClick: () => {
            if (language && engineId) {
              showReview('speech');
              void job.start(language, engineId);
            }
          },
        }}
      />
    </>
  );
}

function LineLengthRows({ busy }: { busy: boolean }) {
  const { t } = useTranslation();
  const editor = useEditor();
  const transcript = getTextLayer(editor.textSnapshot, 'transcript');
  const settings = editor.lineLength;
  const update = (patch: Partial<LineLengthSettings>) =>
    editor.changeLineLength({ ...settings, ...patch });
  const defaultCps = transcript.language === 'zh' ? CHINESE_CPS : LATIN_CPS;
  return (
    <>
      <PanelRow label={t('lineLengthTitle')}>
        <SegmentedControl
          label={t('lineLengthTitle')}
          value={settings.mode}
          size="sm"
          layout="fill"
          isDisabled={busy}
          onChange={(value) => update({ mode: value === 'custom' ? 'custom' : 'auto' })}
        >
          <SegmentedControlItem value="auto" label={t('lineLengthModeAuto')} />
          <SegmentedControlItem value="custom" label={t('lineLengthModeCustom')} />
        </SegmentedControl>
      </PanelRow>
      {settings.mode === 'custom' && (
        <>
          <NumberInput
            label={t('lineLengthCps')}
            units="cps"
            value={settings.cps ?? defaultCps}
            min={1}
            max={100}
            step={1}
            isIntegerOnly
            isWheelEnabled={false}
            isDisabled={busy}
            onChange={(value) => update({ cps: value })}
          />
          <PanelRow label={t('lineLengthMaxLines')}>
            <SegmentedControl
              label={t('lineLengthMaxLines')}
              value={String(settings.max_lines)}
              size="sm"
              layout="fill"
              isDisabled={busy}
              onChange={(value) => update({ max_lines: value === '2' ? 2 : 1 })}
            >
              <SegmentedControlItem value="1" label="1" />
              <SegmentedControlItem value="2" label="2" />
            </SegmentedControl>
          </PanelRow>
          {/* Cleared, the line length follows the subtitle style. */}
          <NumberInput
            label={t('lineLengthMaxChars')}
            placeholder={t('lineLengthModeAuto')}
            value={settings.max_chars}
            min={1}
            max={500}
            step={1}
            isIntegerOnly
            hasClear
            isWheelEnabled={false}
            isDisabled={busy}
            onChange={(value: number | null) => update({ max_chars: value ?? null })}
          />
        </>
      )}
    </>
  );
}

function SpeechReview() {
  const { t } = useTranslation();
  const editor = useEditor();
  const { speech: job } = useEditorGenerators();
  const transcript = getTextLayer(editor.textSnapshot, 'transcript');
  const draft = job.draft;
  const busy = Boolean(job.active) || job.settingUp;
  if (!draft) return null;
  const fresh = speechDraftFresh(draft, {
    documentId: editor.documentId,
    assetId: editor.media?.asset_id ?? '',
    composed: Boolean(editor.composition),
    targetCues: JSON.stringify(transcript.cues),
  });
  const before = transcript.cues;
  const empty = draft.data.cues.length === 0;

  return (
    <VStack gap={3}>
      {empty ? (
        <Text as="p" type="body" role="status">
          {t('speechEmpty')}
        </Text>
      ) : (
        <ReviewRows
          ariaLabel={t('speechDraft')}
          entries={draft.data.cues.map((cue, index) => ({
            key: cue.id,
            time: `${cue.start_ms / 1000}–${cue.end_ms / 1000}`,
            blocks: [
              { key: 'before', label: t('rulesBefore'), text: before[index]?.text ?? '—' },
              { key: 'after', label: t('rulesAfter'), text: cue.text, isPrimary: true },
            ],
          }))}
        />
      )}
      <DrawerFooter>
        <CommandFooter
          status={
            job.error
              ? { tone: 'error', text: t(speechErrorKey(job.error)) }
              : !empty && !fresh
                ? { tone: 'warning', text: t('rulesStale') }
                : null
          }
        >
          <Button label={t('draftDiscard')} onClick={() => job.consume(draft)} />
          {!empty && !fresh && (
            // Out of date, reviewing again is the only way forward, so it takes Apply's place.
            <Button
              label={t('speechReview')}
              variant="primary"
              isDisabled={busy || editor.opening || Boolean(editor.composition)}
              onClick={() => job.review(draft)}
            />
          )}
          {!empty && fresh && (
            <Button
              label={t('draftApply')}
              variant="primary"
              isDisabled={!fresh || busy || editor.opening}
              onClick={() => {
                try {
                  if (editor.applySpeech(draft.data, draft.requestId)) job.consume(draft);
                } catch (reason) {
                  job.report(reason);
                }
              }}
            />
          )}
        </CommandFooter>
      </DrawerFooter>
    </VStack>
  );
}
