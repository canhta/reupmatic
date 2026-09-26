import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { HStack } from '@astryxdesign/core/HStack';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTextLayer } from '../../../../core/subtitles/layers/document';
import { InspectorPanelSection } from '../../../design-system/InspectorPanelSection';
import { useEditor } from '../../editor/EditorContext';
import { LayerLanguageField } from '../../editor/text-layers/LayerLanguageField';
import { synthesisErrorKey } from './error-message';
import { SynthesisReview } from './SynthesisReview';
import { useSynthesisJob } from './useSynthesisJob';

export function SynthesisPanel() {
  const { t } = useTranslation(),
    editor = useEditor();
  const source = getTextLayer(editor.textSnapshot, 'spoken');
  const job = useSynthesisJob({
    documentId: editor.documentId,
    revision: editor.revision,
    snapshot: editor.textSnapshot,
    opening: editor.opening,
  });
  const language = source.language;
  const [voice, setVoice] = useState(''),
    [scope, setScope] = useState<'all' | 'selected'>('selected');
  const [reviewBusy, setReviewBusy] = useState(false);
  const busy = Boolean(job.active) || job.settingUp || reviewBusy;
  const hasVoices = job.voices.length > 0;
  const available =
    (language === 'en' || language === 'vi') && job.voices.some((value) => value.id === voice);
  const languageUnsupported = language !== null && language !== 'en' && language !== 'vi';
  const selectedVoice = job.voices.find((value) => value.id === voice);
  const runCues =
    scope === 'selected' ? source.cues.filter((cue) => cue.id === editor.selected) : source.cues;
  const characters = runCues.reduce((total, cue) => total + cue.text.length, 0);
  const cloudShort = selectedVoice?.source === 'cloud' && characters < 50;
  const voiceLabel = (value: (typeof job.voices)[number]) =>
    value.source === 'cloned'
      ? `${value.label} — ${t('settingsVoicesSourceCloned')}`
      : value.source === 'cloud'
        ? `${value.label} — ${t('settingsVoicesSourceCloud')}`
        : value.label;
  const selectionValid =
    editor.activeTextLayer === 'spoken' && source.cues.some((cue) => cue.id === editor.selected);
  return (
    <InspectorPanelSection title={t('synthesisTitle')}>
      <VStack gap={3}>
        <Text as="p" display="block" type="supporting">
          {t('synthesisLimits')}
        </Text>
        <FormLayout direction="vertical">
          <LayerLanguageField
            layerName="spoken"
            language={language}
            isDisabled={busy}
            onChange={(value) => editor.changeLayerCues(source.cues, 'spoken', { language: value })}
          />
          <Selector
            label={t('synthesisVoice')}
            value={voice}
            isDisabled={busy}
            options={[
              { value: '', label: t('synthesisChooseVoice') },
              ...job.voices.map((v) => ({ value: v.id, label: voiceLabel(v) })),
            ]}
            onChange={setVoice}
          />
          <Selector
            label={t('synthesisScope')}
            value={scope}
            isDisabled={busy}
            options={[
              { value: 'selected', label: t('synthesisSelected') },
              { value: 'all', label: t('synthesisAll') },
            ]}
            onChange={(value) => {
              if (value === 'all' || value === 'selected') setScope(value);
            }}
          />
        </FormLayout>
        {(job.checking || (!job.models?.available && !hasVoices)) && (
          <>
            <Text as="p" display="block" type="body" role="status">
              {job.checking
                ? t('visionChecking')
                : t(synthesisErrorKey(job.models?.code || 'MODEL_MISSING'))}
            </Text>
            <HStack gap={2} vAlign="center" wrap="wrap">
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
            </HStack>
          </>
        )}
        {!available && hasVoices && (
          <Text as="p" display="block" type="body" role="status">
            {t('synthesisVoiceMissing')}
          </Text>
        )}
        {scope === 'selected' && !selectionValid && (
          <Text as="p" display="block" type="body" role="status">
            {t('synthesisSelectionHelp')}
          </Text>
        )}
        {selectedVoice?.source === 'cloud' && (
          <Text as="p" display="block" type="body" role="status">
            {t('synthesisCloudCharacters', { count: characters })}
          </Text>
        )}
        {!source.cues.length && (
          <Text as="p" display="block" type="body" role="status">
            {t('textLayerEmpty')}
          </Text>
        )}
        {source.stale && <Banner status="warning" title={t('textLayerStale')} />}
        {languageUnsupported && <Banner status="warning" title={t('synthesisLanguageMismatch')} />}
        <HStack gap={2} vAlign="center">
          <Button
            label={t('synthesisStart')}
            variant="primary"
            isDisabled={
              busy ||
              editor.opening ||
              !available ||
              cloudShort ||
              languageUnsupported ||
              source.stale ||
              !source.cues.length ||
              (scope === 'selected' && !selectionValid)
            }
            onClick={() =>
              (language === 'en' || language === 'vi') &&
              void job.start({
                language,
                voice_id: voice,
                ...(scope === 'selected' ? { cue_ids: [editor.selected] } : {}),
              })
            }
          />
        </HStack>
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
            title={t(synthesisErrorKey(job.error))}
            description={<code>{job.error}</code>}
          />
        )}
        {job.draft && (
          <SynthesisReview
            key={job.draft.input.request_id}
            draft={job.draft}
            disabled={Boolean(job.active) || job.settingUp}
            onBusy={setReviewBusy}
          />
        )}
      </VStack>
    </InspectorPanelSection>
  );
}
