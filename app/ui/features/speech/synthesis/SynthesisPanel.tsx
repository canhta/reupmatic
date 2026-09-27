import { Button } from '@astryxdesign/core/Button';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { retainedVoiceCueIds } from '../../../../core/speech/synthesis/voice-track';
import { getTextLayer } from '../../../../core/subtitles/layers/document';
import { InspectorPanelSection } from '../../../design-system/InspectorPanelSection';
import { useEditor } from '../../editor/EditorContext';
import { useEditorGenerators } from '../../editor/EditorGeneratorContext';
import { GeneratorFooter } from '../../editor/GeneratorFooter';
import { LayerLanguageField } from '../../editor/text-layers/LayerLanguageField';
import { synthesisErrorKey } from './error-message';
import { SynthesisReview } from './SynthesisReview';

export function SynthesisPanel() {
  const { t } = useTranslation(),
    editor = useEditor();
  const source = getTextLayer(editor.textSnapshot, 'spoken');
  // The job and its draft live above the tool panel so a tool switch cannot cancel or drop them.
  const job = useEditorGenerators().synthesis;
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
  // A selected-cue generate re-mixes the cues the track already survives with, so line-by-line
  // generation keeps every earlier line.
  const selectedIds =
    scope === 'selected' && editor.selected
      ? [
          ...new Set([
            ...retainedVoiceCueIds(
              editor.voiceTrack,
              source.cues.map((cue) => cue.id),
            ),
            editor.selected,
          ]),
        ]
      : undefined;
  const runCues = selectedIds
    ? source.cues.filter((cue) => selectedIds.includes(cue.id))
    : source.cues;
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
  // One readiness Banner carries the first reason the primary is blocked; the billing line and the
  // limits copy stay as plain body text.
  const blockingReason = job.checking
    ? t('visionChecking')
    : !job.models?.available && !hasVoices
      ? t(synthesisErrorKey(job.models?.code || 'MODEL_MISSING'))
      : languageUnsupported
        ? t('synthesisLanguageMismatch')
        : source.stale
          ? t('textLayerStale')
          : !source.cues.length
            ? t('textLayerEmpty')
            : scope === 'selected' && !selectionValid
              ? t('synthesisSelectionHelp')
              : !available && hasVoices
                ? t('synthesisVoiceMissing')
                : undefined;
  return (
    <InspectorPanelSection title={t('synthesisTitle')}>
      <VStack gap={3}>
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
        <Text as="p" display="block" type="body">
          {t('synthesisLimits')}
        </Text>
        {selectedVoice?.source === 'cloud' && (
          <Text as="p" display="block" type="body" role="status">
            {t('synthesisCloudCharacters', { count: characters })}
          </Text>
        )}
        <GeneratorFooter
          readiness={{
            reason: blockingReason,
            checking: job.checking,
            canSetUp: Boolean(job.models && !job.models.available),
            onSetUp: () => void editor.openSettings('processing'),
            onRefresh: () => void job.refresh(),
          }}
          active={job.active}
          error={job.error}
          errorLabel={t(synthesisErrorKey(job.error))}
          cancel={() => void job.cancel()}
        >
          <Button
            label={t('synthesisStart')}
            variant="primary"
            width="100%"
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
                ...(selectedIds ? { cue_ids: selectedIds } : {}),
              })
            }
          />
        </GeneratorFooter>
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
