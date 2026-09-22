import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Selector } from '@astryxdesign/core/Selector';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { offeredSpeechEngines } from '../../../core/speech/engine-capability';
import { getTextLayer } from '../../../core/subtitles/layers/document';
import { InspectorPanelSection } from '../../design-system/InspectorPanelSection';
import { useEditor } from '../editor/EditorContext';
import { useEditorGenerators } from '../editor/EditorGeneratorContext';
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
  const [scope, setScope] = useState<'sample' | 'full'>('sample');
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
        {(job.checking || !available) && (
          <>
            <Text as="p" display="block" type="body" role="status">
              {job.checking
                ? t('visionChecking')
                : !language
                  ? t('speechChooseLanguage')
                  : t(speechErrorKey(problemCode(job.models, language)))}
            </Text>
            {}
            <HStack gap={2} vAlign="center" wrap="wrap">
              {job.models && (
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
            </HStack>
          </>
        )}
        {job.active && (
          <HStack gap={2} vAlign="center" role="status">
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
          </HStack>
        )}
        {job.error && (
          <Banner
            status="error"
            title={t(speechErrorKey(job.error))}
            description={<code>{job.error}</code>}
          />
        )}
        <HStack gap={2} vAlign="center">
          <Button
            label={t('speechStart')}
            variant="primary"
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
                void job.start(language, scope, engineId);
              }
            }}
          />
        </HStack>
      </Stack>
    </InspectorPanelSection>
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
  const fresh =
    draft.revision === editor.revision &&
    draft.documentId === editor.documentId &&
    !editor.composition;
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
                  if (editor.applySpeech(draft.data, draft.revision, draft.requestId)) {
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
      {job.error && (
        <Banner
          status="error"
          title={t(speechErrorKey(job.error))}
          description={<code>{job.error}</code>}
        />
      )}
    </VStack>
  );
}
