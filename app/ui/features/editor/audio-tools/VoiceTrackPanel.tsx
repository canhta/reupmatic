import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import type { VoiceTrack } from '../../../../core/speech/synthesis/voice-track';
import { InspectorPanelSection } from '../../../design-system/InspectorPanelSection';
import { useEditor } from '../EditorContext';

type VoiceTrackEdit = Partial<Pick<VoiceTrack, 'mode' | 'gain_db' | 'fade_in_ms' | 'fade_out_ms'>>;

export function VoiceTrackPanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const track = editor.voiceTrack;
  if (!track) {
    return (
      <InspectorPanelSection title={t('voiceTrackTitle')}>
        <Text as="p" type="body">
          {t('voiceTrackNone')}
        </Text>
      </InspectorPanelSection>
    );
  }
  const busy = editor.opening || editor.busy;
  const disabled = busy || track.stale;
  const duration = track.artifact.duration_ms / 1000;
  const change = (patch: VoiceTrackEdit) => editor.changeVoiceTrack({ ...track, ...patch });
  return (
    <InspectorPanelSection title={t('voiceTrackTitle')}>
      <VStack gap={3}>
        <Text as="p" type="body">
          {t('voiceTrackSummary', {
            voice: track.provenance.voice_id,
            language: t(`visionLanguage_${track.provenance.language}`),
            duration: duration.toFixed(2),
          })}
        </Text>
        {track.stale && <Banner status="warning" title={t('synthesisVoiceStale')} />}
        <Selector
          label={t('voiceTrackSourceAudio')}
          value={track.mode}
          isDisabled={disabled}
          options={[
            { value: 'replace', label: t('voiceTrackReplace') },
            { value: 'mix', label: t('voiceTrackMix') },
          ]}
          onChange={(mode) => {
            if (mode === 'replace' || mode === 'mix') change({ mode });
          }}
        />
        <Grid columns={2} gap={3}>
          <NumberInput
            label={t('voiceTrackGain')}
            units="dB"
            width="100%"
            value={track.gain_db}
            min={-60}
            max={24}
            step={1}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(gain_db) => change({ gain_db })}
          />
          <NumberInput
            label={t('voiceTrackFadeIn')}
            units="s"
            width="100%"
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
            units="s"
            width="100%"
            value={track.fade_out_ms / 1000}
            min={0}
            max={duration}
            step={0.1}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(value) => change({ fade_out_ms: Math.round(value * 1000) })}
          />
        </Grid>
        {track.plan.lines.some((line) => line.rate !== 1) && (
          <Text as="p" type="body">
            {t('voiceTrackPitchNote')}
          </Text>
        )}
        <HStack gap={2} vAlign="center" wrap="wrap">
          {track.stale && (
            <Button
              label={t('voiceTrackKeep')}
              isDisabled={busy}
              onClick={() => editor.acceptStaleVoiceTrack()}
            />
          )}
          <Button
            label={t('voiceTrackRemove')}
            isDisabled={busy}
            onClick={() => editor.changeVoiceTrack(undefined)}
          />
        </HStack>
      </VStack>
    </InspectorPanelSection>
  );
}
