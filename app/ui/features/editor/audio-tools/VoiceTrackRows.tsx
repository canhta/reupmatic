import { Button } from '@astryxdesign/core/Button';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import { liveOutputClock, voiceCuesOutsideOutput } from '../../../../core/editing/live-mix';
import type { VoiceTrack } from '../../../../core/speech/synthesis/voice-track';
import {
  PanelPair,
  PanelRow,
  PanelRows,
  PanelStatus,
  SliderRow,
} from '../../../design-system/Panel';
import { useEditor } from '../EditorContext';

type VoiceTrackEdit = Partial<Pick<VoiceTrack, 'mode' | 'gain_db' | 'fade_in_ms' | 'fade_out_ms'>>;

/** The applied voice track's mix, under the Voiceover options. */
export function VoiceTrackRows() {
  const { t } = useTranslation();
  const editor = useEditor();
  const track = editor.voiceTrack;
  if (!track) return null;
  const busy = editor.opening || editor.busy;
  const disabled = busy || track.stale;
  const duration = track.artifact.duration_ms / 1000;
  const change = (patch: VoiceTrackEdit) => editor.changeVoiceTrack({ ...track, ...patch });
  // A speed change refits the plan; lines it leaves past the cap are long, unless the trim cuts them.
  const cut = voiceCuesOutsideOutput(
    track.plan,
    liveOutputClock(editor.processing?.editing, editor.duration),
  );
  const longLines = track.plan.conflicts.filter((line) => !cut.has(line.cue_id)).length;
  return (
    <VStack gap={3}>
      <Text type="body" maxLines={1}>
        {t('voiceTrackSummary', {
          voice: track.provenance.voice_id,
          language: t(`visionLanguage_${track.provenance.language}`),
          duration: duration.toFixed(1),
        })}
      </Text>
      {track.stale && (
        <PanelStatus tone="warning" text={t('synthesisVoiceStale')}>
          <Button
            size="sm"
            label={t('voiceTrackKeep')}
            isDisabled={busy}
            onClick={() => editor.acceptStaleVoiceTrack()}
          />
        </PanelStatus>
      )}
      {!track.stale && longLines > 0 && (
        <PanelStatus tone="warning" text={t('synthesisTimingConflicts', { count: longLines })} />
      )}
      <PanelRows>
        <PanelRow label={t('voiceTrackSourceAudio')}>
          <SegmentedControl
            label={t('voiceTrackSourceAudio')}
            value={track.mode}
            size="sm"
            layout="fill"
            isDisabled={disabled}
            onChange={(mode) => {
              if (mode === 'replace' || mode === 'mix') change({ mode });
            }}
          >
            <SegmentedControlItem value="mix" label={t('voiceTrackMix')} />
            <SegmentedControlItem value="replace" label={t('voiceTrackReplace')} />
          </SegmentedControl>
        </PanelRow>
        <SliderRow
          label={t('voiceTrackGain')}
          units="dB"
          min={-60}
          max={24}
          step={1}
          value={track.gain_db}
          isDisabled={disabled}
          onChange={(gain_db) => change({ gain_db })}
        />
        <PanelPair label={t('voiceTrackFade')}>
          <NumberInput
            label={t('voiceTrackFadeIn')}
            isLabelHidden
            units="s"
            value={track.fade_in_ms / 1000}
            min={0}
            max={duration}
            step={0.1}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(value) => change({ fade_in_ms: Math.round(value * 1000) })}
          />
          <NumberInput
            label={t('voiceTrackFadeOut')}
            isLabelHidden
            units="s"
            value={track.fade_out_ms / 1000}
            min={0}
            max={duration}
            step={0.1}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(value) => change({ fade_out_ms: Math.round(value * 1000) })}
          />
        </PanelPair>
      </PanelRows>
    </VStack>
  );
}
