import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  defaultVoiceSourceLayer,
  retainedVoiceCueIds,
} from '../../../../core/speech/synthesis/voice-track';
import { staleLayerSource } from '../../../../core/subtitles/layers/commands';
import {
  getTextLayer,
  type TextLayerName,
  textLayerNames,
} from '../../../../core/subtitles/layers/document';
import { PanelRow, PanelRows, PanelSection } from '../../../design-system/Panel';
import { VoiceTrackRows } from '../../editor/audio-tools/VoiceTrackRows';
import { useEditor } from '../../editor/EditorContext';
import { useEditorGenerators } from '../../editor/EditorGeneratorContext';
import { useEditorSources } from '../../editor/EditorSourceContext';
import { GeneratorFooter } from '../../editor/GeneratorFooter';
import { CopyLayerDialog } from '../../editor/text-layers/CopyLayerDialog';
import { LayerLanguageField } from '../../editor/text-layers/LayerLanguageField';
import { synthesisErrorKey } from './error-message';
import { SynthesisReview } from './SynthesisReview';

/**
 * Audio › Voiceover: the voice and lines to speak, the draft to hear and apply, then the applied
 * track's mix. Generate voice is the panel's one command, so it holds the drawer footer.
 */
export function VoiceoverSection() {
  const { t } = useTranslation();
  const editor = useEditor();
  // Follows the default (the track's layer, else translated, else spoken) until the user picks.
  const [chosenLayer, setChosenLayer] = useState<TextLayerName | null>(null);
  const layer = chosenLayer ?? defaultVoiceSourceLayer(editor.textSnapshot);
  const source = getTextLayer(editor.textSnapshot, layer);
  // The job and its draft live above the tool panel so a tool switch cannot cancel or drop them.
  const { synthesis: job, translation, showReview } = useEditorGenerators();
  const sources = useEditorSources();
  const language = source.language;
  const [voice, setVoice] = useState('');
  const [scope, setScope] = useState<'all' | 'selected'>('selected');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewingSource, setReviewingSource] = useState(false);
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
    editor.activeTextLayer === layer && source.cues.some((cue) => cue.id === editor.selected);
  const overLimit = runCues.length > 100 || runCues.some((cue) => cue.text.length > 300);
  // Only a missing or broken model offers Set up; every other reason the command waits is the
  // footer's status line.
  const modelReason = job.checking
    ? t('visionChecking')
    : !job.models?.available && !hasVoices
      ? t(synthesisErrorKey(job.models?.code || 'MODEL_MISSING'))
      : undefined;
  const blocked = languageUnsupported
    ? t('synthesisLanguageMismatch')
    : source.stale
      ? t('textLayerStale')
      : !source.cues.length
        ? t('textLayerEmpty')
        : scope === 'selected' && !selectionValid
          ? t('synthesisSelectionHelp')
          : overLimit
            ? t('synthesisLimit')
            : !available && hasVoices
              ? t('synthesisVoiceMissing')
              : undefined;
  const canGenerate = !(
    busy ||
    editor.opening ||
    !available ||
    cloudShort ||
    overLimit ||
    languageUnsupported ||
    source.stale ||
    !source.cues.length ||
    (scope === 'selected' && !selectionValid)
  );
  function generate() {
    if (language === 'en' || language === 'vi')
      void job.start({
        source_layer: layer,
        language,
        voice_id: voice,
        ...(selectedIds ? { cue_ids: selectedIds } : {}),
      });
  }
  // A stale copy or translation offers its way out here: restore the language, review or retranslate.
  const staleSource = staleLayerSource(editor.textSnapshot, layer);
  const drift = staleSource?.language;
  const origin = source.origin;
  const canRetranslate =
    origin.kind === 'translation' &&
    !drift &&
    !translation.active &&
    Boolean(translation.models?.available) &&
    translation.models?.source_language === origin.source_language &&
    translation.models?.target_language === origin.target_language;
  function retranslate() {
    if (origin.kind !== 'translation') return;
    showReview('translate');
    if (sources.activeSource !== 'captions') sources.selectSource('captions');
    void translation.start({
      source_layer: origin.layer,
      source_language: origin.source_language,
      target_language: origin.target_language,
      rules: origin.rules,
    });
  }
  const staleNotice = !staleSource
    ? undefined
    : drift
      ? t('textLayerLanguageDrift', {
          source: t(`textLayer_${staleSource.from}`),
          current: t(`visionLanguage_${drift.current}`),
          expected: t(`visionLanguage_${drift.expected}`),
        })
      : t('textLayerSourceChanged', { source: t(`textLayer_${staleSource.from}`) });
  const staleMenu: DropdownMenuOption[] =
    staleSource && origin.kind === 'translation'
      ? [
          {
            label: t('synthesisRetranslate'),
            isDisabled: busy || editor.opening || !canRetranslate,
            onClick: retranslate,
          },
        ]
      : [];
  const staleAction = !staleSource
    ? null
    : drift
      ? {
          label: t('textLayerUseLanguage', { language: t(`visionLanguage_${drift.expected}`) }),
          isDisabled: busy || editor.opening,
          onClick: () => {
            const from = getTextLayer(editor.textSnapshot, staleSource.from);
            editor.changeLayerCues(from.cues, staleSource.from, { language: drift.expected });
          },
        }
      : {
          label: t('textLayerReview'),
          isDisabled: busy || editor.opening,
          onClick: () => setReviewingSource(true),
        };
  const trackMenu: DropdownMenuOption[] = editor.voiceTrack
    ? [
        {
          label: t('voiceTrackRemove'),
          variant: 'destructive',
          isDisabled: editor.opening || editor.busy,
          onClick: () => editor.changeVoiceTrack(undefined),
        },
      ]
    : [];

  return (
    <PanelSection title={t('voiceTrackTitle')}>
      <PanelRows>
        <Selector
          label={t('synthesisSourceLayer')}
          value={layer}
          isDisabled={busy}
          options={textLayerNames.map((value) => ({ value, label: t(`textLayer_${value}`) }))}
          onChange={(value) => {
            const next = textLayerNames.find((name) => name === value);
            if (next) setChosenLayer(next);
          }}
        />
        <Selector
          label={t('synthesisVoice')}
          value={voice}
          isDisabled={busy}
          hasSearch={job.voices.length > 10}
          placeholder={t('synthesisChooseVoice')}
          options={job.voices.map((v) => ({ value: v.id, label: voiceLabel(v) }))}
          onChange={setVoice}
        />
        <LayerLanguageField
          language={language}
          isDisabled={busy}
          onChange={(value) => editor.changeLayerCues(source.cues, layer, { language: value })}
        />
        <PanelRow label={t('synthesisScope')}>
          <SegmentedControl
            label={t('synthesisScope')}
            value={scope}
            size="sm"
            layout="fill"
            isDisabled={busy}
            onChange={(value) => {
              if (value === 'all' || value === 'selected') setScope(value);
            }}
          >
            <SegmentedControlItem value="selected" label={t('synthesisSelected')} />
            <SegmentedControlItem value="all" label={t('synthesisAll')} />
          </SegmentedControl>
        </PanelRow>
      </PanelRows>
      {selectedVoice?.source === 'cloud' && (
        <Text as="p" type="body" role="status">
          {t('synthesisCloudCharacters', { count: characters })}
        </Text>
      )}
      {job.draft && (
        <SynthesisReview
          key={job.draft.input.request_id}
          draft={job.draft}
          disabled={Boolean(job.active) || job.settingUp}
          onBusy={setReviewBusy}
          generate={{ isDisabled: !canGenerate, onClick: generate }}
          menu={trackMenu}
          hasFooter={!job.active}
        />
      )}
      {editor.voiceTrack && <VoiceTrackRows />}
      {(!job.draft || job.active) && (
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
          errorLabel={t(synthesisErrorKey(job.error))}
          notice={staleNotice}
          menu={[...staleMenu, ...trackMenu]}
          cancel={() => void job.cancel()}
          primary={
            staleAction ?? {
              label: t('synthesisStart'),
              isDisabled: !canGenerate,
              blocked,
              onClick: generate,
            }
          }
        />
      )}
      <CopyLayerDialog
        isOpen={reviewingSource}
        onClose={() => setReviewingSource(false)}
        preset={{ from: staleSource?.from ?? 'transcript', to: layer }}
      />
    </PanelSection>
  );
}
