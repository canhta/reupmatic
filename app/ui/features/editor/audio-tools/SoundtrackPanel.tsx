import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { List, ListItem } from '@astryxdesign/core/List';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Pause, Play, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  clampSoundtrack,
  DEFAULT_SOUNDTRACK_DUCK,
  type Soundtrack,
} from '../../../../core/editing/soundtrack';
import { unwrap } from '../../../bridge/client';
import {
  PanelPair,
  PanelRow,
  PanelRows,
  PanelSection,
  SliderRow,
} from '../../../design-system/Panel';
import { useEditor } from '../EditorContext';

function useSoundtrackUpdate() {
  const editor = useEditor();
  return (patch: Partial<Soundtrack>) => {
    const track = editor.soundtrack;
    if (track) editor.changeSoundtrack(clampSoundtrack({ ...track, ...patch }));
  };
}

/** Audio › Music: the track row with play and ⋯, then how it mixes. Add sits in the header. */
export function MusicSection() {
  const { t } = useTranslation();
  const editor = useEditor();
  const track = editor.soundtrack;
  const disabled = editor.busy || editor.opening;
  const update = useSoundtrackUpdate();
  return (
    <PanelSection
      title={t('soundtrackTitle')}
      actions={
        !track && (
          <IconButton
            label={t('soundtrackAdd')}
            tooltip={t('soundtrackAdd')}
            variant="ghost"
            size="sm"
            isDisabled={disabled || !editor.media}
            icon={<Icon icon={Plus} size="sm" />}
            onClick={() => void editor.importMedia()}
          />
        )
      }
    >
      {track && (
        <>
          <TrackRow track={track} disabled={disabled} />
          <PanelRows>
            <PanelRow label={t('soundtrackMode')}>
              <SegmentedControl
                label={t('soundtrackMode')}
                value={track.mode}
                size="sm"
                layout="fill"
                isDisabled={disabled}
                onChange={(mode) => {
                  if (mode === 'replace' || mode === 'mix') update({ mode });
                }}
              >
                <SegmentedControlItem value="mix" label={t('soundtrackMix')} />
                <SegmentedControlItem value="replace" label={t('soundtrackReplace')} />
              </SegmentedControl>
            </PanelRow>
            <SliderRow
              label={t('soundtrackGain')}
              units="dB"
              min={-60}
              max={24}
              step={1}
              value={track.gain_db}
              isDisabled={disabled}
              onChange={(gain_db) => update({ gain_db })}
            />
            <SecondsPair
              label={t('soundtrackRange')}
              keys={['start_ms', 'end_ms']}
              track={track}
              disabled={disabled}
            />
            <NumberInput
              label={t('soundtrack_offset_ms')}
              units="s"
              value={track.offset_ms / 1000}
              min={0}
              max={86400}
              step={0.1}
              isDisabled={disabled}
              isWheelEnabled={false}
              onChange={(value) => update({ offset_ms: Math.round(value * 1000) })}
            />
            <SecondsPair
              label={t('soundtrackFade')}
              keys={['fade_in_ms', 'fade_out_ms']}
              track={track}
              disabled={disabled}
            />
          </PanelRows>
        </>
      )}
    </PanelSection>
  );
}

/** Two times that are one pair (start/end, fade in/out) share a row. */
function SecondsPair({
  label,
  keys,
  track,
  disabled,
}: {
  label: string;
  keys: ['start_ms', 'end_ms'] | ['fade_in_ms', 'fade_out_ms'];
  track: Soundtrack;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const update = useSoundtrackUpdate();
  return (
    <PanelPair label={label}>
      {keys.map((key) => (
        <NumberInput
          key={key}
          label={t(`soundtrack_${key}`)}
          isLabelHidden
          units="s"
          value={track[key] / 1000}
          min={0}
          max={track.source.duration_ms / 1000}
          step={0.1}
          isDisabled={disabled}
          isWheelEnabled={false}
          onChange={(value) => update({ [key]: Math.round(value * 1000) })}
        />
      ))}
    </PanelPair>
  );
}

function TrackRow({ track, disabled }: { track: Soundtrack; disabled: boolean }) {
  const { t } = useTranslation();
  const editor = useEditor();
  const player = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState('');
  const [playing, setPlaying] = useState(false);
  const source = track.source;

  useEffect(() => {
    let alive = true;
    setUrl('');
    setPlaying(false);
    const input: Soundtrack = {
      source,
      mode: 'replace',
      start_ms: 0,
      end_ms: source.duration_ms,
      offset_ms: 0,
      gain_db: 0,
      fade_in_ms: 0,
      fade_out_ms: 0,
      duck: DEFAULT_SOUNDTRACK_DUCK,
      muted: false,
    };
    void unwrap(window.reupmatic.audioPreview(input))
      .then((value) => {
        if (alive) setUrl(value.url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [source]);

  return (
    <List density="compact" hasDividers aria-label={t('soundtrackTitle')}>
      <ListItem
        label={source.name}
        description={`${(source.duration_ms / 1000).toFixed(1)} s`}
        startContent={
          <IconButton
            label={playing ? t('soundtrackPause') : t('soundtrackListen')}
            tooltip={playing ? t('soundtrackPause') : t('soundtrackListen')}
            variant="ghost"
            size="sm"
            isDisabled={!url}
            icon={<Icon icon={playing ? Pause : Play} size="sm" />}
            onClick={() => {
              const audio = player.current;
              if (!audio) return;
              if (audio.paused) void audio.play().catch(() => setPlaying(false));
              else audio.pause();
            }}
          />
        }
        endContent={
          <>
            {url && (
              <audio
                ref={player}
                src={url}
                preload="metadata"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
              />
            )}
            <MoreMenu
              label={t('soundtrackTrackActions')}
              size="sm"
              items={[
                {
                  label: t('soundtrackReplaceTrack'),
                  isDisabled: disabled,
                  onClick: () => void editor.importMedia(),
                },
                {
                  label: t('soundtrackRemove'),
                  variant: 'destructive',
                  isDisabled: disabled,
                  onClick: () => editor.changeSoundtrack(undefined),
                },
              ]}
            />
          </>
        }
      />
    </List>
  );
}

/** Audio › Ducking: the music dips under speech while it is on. */
export function DuckingSection() {
  const { t } = useTranslation();
  const editor = useEditor();
  const track = editor.soundtrack;
  const disabled = editor.busy || editor.opening;
  const update = useSoundtrackUpdate();
  if (!track) return null;
  const duck = track.duck;
  return (
    <PanelSection
      title={t('soundtrackDuckTitle')}
      isOn={duck.enabled}
      isDisabled={disabled}
      onToggle={(enabled) => update({ duck: { ...duck, enabled } })}
      onReset={() => update({ duck: { ...DEFAULT_SOUNDTRACK_DUCK, enabled: duck.enabled } })}
    >
      <PanelRows>
        <SliderRow
          label={t('soundtrackDuckAmount')}
          units="dB"
          min={1}
          max={24}
          step={1}
          value={duck.amount_db}
          isDisabled={disabled}
          onChange={(amount_db) => update({ duck: { ...duck, amount_db } })}
        />
        <NumberInput
          label={t('soundtrackDuckRelease')}
          units="s"
          value={duck.release_ms / 1000}
          min={0.01}
          max={5}
          step={0.01}
          isWheelEnabled={false}
          isDisabled={disabled}
          onChange={(seconds) =>
            update({ duck: { ...duck, release_ms: Math.round(seconds * 1000) } })
          }
        />
      </PanelRows>
    </PanelSection>
  );
}
