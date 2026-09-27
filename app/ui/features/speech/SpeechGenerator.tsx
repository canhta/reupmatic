import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { speechDraftFresh } from '../../../core/speech/draft-freshness';
import { offeredSpeechEngines } from '../../../core/speech/engine-capability';
import { getTextLayer } from '../../../core/subtitles/layers/document';
import { CHINESE_CPS, LATIN_CPS, type LineLengthSettings } from '../../../core/subtitles/split';
import { InspectorPanelSection } from '../../design-system/InspectorPanelSection';
import { useEditor } from '../editor/EditorContext';
import { useEditorGenerators } from '../editor/EditorGeneratorContext';
import { GeneratorFooter } from '../editor/GeneratorFooter';
import { LayerLanguageField } from '../editor/text-layers/LayerLanguageField';
import { ReviewRows } from '../editor/text-layers/ReviewRows';
import { engineName } from './engine-name';
import { speechErrorKey } from './error-message';
import { problemCode } from './useSpeechJob';

export function SpeechSetup() {
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
  const [engineId, setEngineId] = useState<string | null>(null);
  useEffect(() => {
    if (!engines.some((entry) => entry.engine === engineId)) {
      setEngineId(engines[0]?.engine ?? null);
    }
  }, [engines, engineId]);
  const available = engines.length > 0;

  return (
    <InspectorPanelSection title={t('speechTitle')}>
      {}
      <Stack direction="vertical" gap={3}>
        {editor.composition ? (
          <Banner status="warning" title={t('speechComposition')} />
        ) : (
          !media?.has_audio && <Banner status="warning" title={t('speechNoAudio')} />
        )}
        <FormLayout direction="vertical">
          <LayerLanguageField
            layerName="transcript"
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
                if (value) setEngineId(value);
              }}
            />
          )}
        </FormLayout>
        {engines.length === 1 && (
          <Text as="p" display="block" type="supporting">
            {t('speechEngineSingle', { engine: engines[0].engine })}
          </Text>
        )}
        <GeneratorFooter
          readiness={{
            reason:
              job.checking || !available
                ? job.checking
                  ? t('visionChecking')
                  : !language
                    ? t('speechChooseLanguage')
                    : t(speechErrorKey(problemCode(job.models, language)))
                : undefined,
            checking: job.checking,
            canSetUp: Boolean(job.models),
            onSetUp: () => void editor.openSettings('processing'),
            onRefresh: () => void job.refresh(),
          }}
          active={job.active}
          error={job.error}
          errorLabel={t(speechErrorKey(job.error))}
          cancel={() => void job.cancel()}
        >
          <Button
            label={t('speechStart')}
            variant="primary"
            width="100%"
            isDisabled={
              busy ||
              editor.opening ||
              !available ||
              !engineId ||
              !language ||
              !media?.has_audio ||
              Boolean(editor.composition)
            }
            onClick={() => {
              if (language && engineId) {
                showReview('speech');
                void job.start(language, engineId);
              }
            }}
          />
        </GeneratorFooter>
        <LineLengthSection />
      </Stack>
    </InspectorPanelSection>
  );
}

function LineLengthSection() {
  const { t } = useTranslation();
  const editor = useEditor();
  const { speech: job } = useEditorGenerators();
  const transcript = getTextLayer(editor.textSnapshot, 'transcript');
  const settings = editor.lineLength;
  const busy = Boolean(job.active) || job.settingUp;
  const update = (patch: Partial<LineLengthSettings>) =>
    editor.changeLineLength({ ...settings, ...patch });
  const defaultCps = transcript.language === 'zh' ? CHINESE_CPS : LATIN_CPS;
  return (
    <Collapsible trigger={t('lineLengthTitle')} defaultIsOpen={false}>
      <VStack gap={2} paddingBlock={2}>
        <Selector
          label={t('lineLengthMode')}
          value={settings.mode}
          isDisabled={busy}
          options={[
            { value: 'auto', label: t('lineLengthModeAuto') },
            { value: 'custom', label: t('lineLengthModeCustom') },
          ]}
          onChange={(value) => update({ mode: value === 'custom' ? 'custom' : 'auto' })}
        />
        {settings.mode === 'custom' && (
          <>
            <NumberInput
              label={t('lineLengthCps')}
              value={settings.cps ?? defaultCps}
              min={1}
              max={100}
              step={1}
              isIntegerOnly
              isWheelEnabled={false}
              isDisabled={busy}
              onChange={(value) => update({ cps: value })}
            />
            <Selector
              label={t('lineLengthMaxLines')}
              value={String(settings.max_lines)}
              isDisabled={busy}
              options={[
                { value: '1', label: '1' },
                { value: '2', label: '2' },
              ]}
              onChange={(value) => update({ max_lines: value === '2' ? 2 : 1 })}
            />
            <CheckboxInput
              label={t('lineLengthAutoChars')}
              value={settings.max_chars === null}
              isDisabled={busy}
              onChange={(checked) => update({ max_chars: checked ? null : 42 })}
            />
            {settings.max_chars !== null && (
              <NumberInput
                label={t('lineLengthMaxChars')}
                value={settings.max_chars}
                min={1}
                max={500}
                step={1}
                isIntegerOnly
                isWheelEnabled={false}
                isDisabled={busy}
                onChange={(value) => update({ max_chars: value })}
              />
            )}
          </>
        )}
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Button
            size="sm"
            label={t('lineLengthResplit')}
            isDisabled={busy || editor.opening || !transcript.cues.length}
            onClick={() => {
              try {
                editor.resplitTranscript();
              } catch (reason) {
                job.report(reason);
              }
            }}
          />
          {editor.transcriptNeedsResplit && (
            <Text as="p" type="supporting">
              {t('lineLengthStale')}
            </Text>
          )}
        </HStack>
      </VStack>
    </Collapsible>
  );
}

export function SpeechReview() {
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

  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center" hAlign="between">
        <Heading level={5}>{t('speechDraft')}</Heading>
        <IconButton
          label={t('cancel')}
          tooltip={t('cancel')}
          size="sm"
          variant="ghost"
          icon={<Icon icon="close" size="sm" />}
          onClick={() => job.consume(draft)}
        />
      </HStack>
      {}
      <Text as="p" display="block" type="body">
        {t('speechReplaceHelp', { count: draft.data.cues.length })}
      </Text>
      <Text as="p" display="block" type="supporting">
        {t('speechResultInfo', {
          language: t(`visionLanguage_${draft.data.language}`),
          start: draft.data.start_ms / 1000,
          end: draft.data.end_ms / 1000,
          engine: engineName(draft.data.runtime),
        })}
      </Text>
      {draft.data.cues.length === 0 ? (
        <Text as="p" display="block" type="body" role="status">
          {t('speechEmpty')}
        </Text>
      ) : (
        <>
          {!fresh && (
            <Banner status="warning" title={t('rulesStale')} description={t('speechStaleHelp')} />
          )}
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
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Button label={t('speechDiscard')} onClick={() => job.consume(draft)} />
            {!fresh && (
              <Button
                label={t('speechReview')}
                isDisabled={busy || editor.opening || Boolean(editor.composition)}
                onClick={() => job.review(draft)}
              />
            )}
            <Button
              label={t('speechApply')}
              variant="primary"
              isDisabled={!fresh || busy || editor.opening}
              onClick={() => {
                try {
                  if (editor.applySpeech(draft.data, draft.requestId)) {
                    job.consume(draft);
                  }
                } catch (reason) {
                  job.report(reason);
                }
              }}
            />
          </HStack>
        </>
      )}
      {job.error && <Banner status="error" title={t(speechErrorKey(job.error))} />}
    </VStack>
  );
}
