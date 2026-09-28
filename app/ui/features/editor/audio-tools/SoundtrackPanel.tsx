import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Grid } from '@astryxdesign/core/Grid';
import { Icon } from '@astryxdesign/core/Icon';
import { List, ListItem } from '@astryxdesign/core/List';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Music, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  clampSoundtrack,
  DEFAULT_SOUNDTRACK_DUCK,
  type Soundtrack,
} from '../../../../core/editing/soundtrack';
import { unwrap } from '../../../bridge/client';
import { InspectorPanelSection } from '../../../design-system/InspectorPanelSection';
import { useEditor } from '../EditorContext';

const milliseconds = ['start_ms', 'end_ms', 'offset_ms', 'fade_in_ms', 'fade_out_ms'] as const;

export function SoundtrackPanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const track = editor.soundtrack;
  const disabled = editor.busy || editor.opening;
  const [url, setUrl] = useState('');
  const source = track?.source;

  useEffect(() => {
    let alive = true;
    setUrl('');
    if (source) {
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
    }
    return () => {
      alive = false;
    };
  }, [source?.path, source?.sha256, source?.duration_ms, source]);

  function update(patch: Partial<Soundtrack>) {
    if (!track) return;
    editor.changeSoundtrack(clampSoundtrack({ ...track, ...patch }));
  }

  return (
    <InspectorPanelSection title={t('soundtrackTitle')}>
      {track ? (
        <VStack gap={3}>
          <List density="compact" hasDividers aria-label={t('soundtrackTitle')}>
            <ListItem
              label={track.source.name}
              description={`${(track.source.duration_ms / 1000).toFixed(2)} s`}
              startContent={<Icon icon={Music} size="sm" color="secondary" />}
              endContent={
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
              }
            />
          </List>
          {url && (
            <audio
              className="soundtrack-preview"
              src={url}
              controls
              preload="metadata"
              aria-label={t('soundtrackListen')}
            />
          )}
          <Selector
            label={t('soundtrackMode')}
            value={track.mode}
            isDisabled={disabled}
            options={[
              { value: 'replace', label: t('soundtrackReplace') },
              { value: 'mix', label: t('soundtrackMix') },
            ]}
            onChange={(mode) => {
              if (mode === 'replace' || mode === 'mix') update({ mode });
            }}
          />
          <Grid columns={2} gap={3}>
            {milliseconds.map((key) => (
              <NumberInput
                key={key}
                label={t(`soundtrack_${key}`)}
                units="s"
                width="100%"
                value={track[key] / 1000}
                min={0}
                max={key === 'offset_ms' ? 86400 : track.source.duration_ms / 1000}
                step={0.1}
                isDisabled={disabled}
                isWheelEnabled={false}
                onChange={(value) => update({ [key]: Math.round(value * 1000) })}
              />
            ))}
          </Grid>
          <NumberInput
            label={t('soundtrackGain')}
            units="dB"
            width="100%"
            value={track.gain_db}
            min={-60}
            max={24}
            step={1}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(gain_db) => update({ gain_db })}
          />
          <Collapsible
            trigger={
              <Text type="body" weight="semibold">
                {t('soundtrackDuckTitle')}
              </Text>
            }
            defaultIsOpen={false}
          >
            <VStack gap={3} paddingBlock={2}>
              <Switch
                label={t('soundtrackDuck')}
                value={track.duck.enabled}
                isDisabled={disabled}
                onChange={(enabled) => update({ duck: { ...track.duck, enabled } })}
              />
              {track.duck.enabled && (
                <Grid columns={2} gap={3}>
                  <NumberInput
                    label={t('soundtrackDuckAmount')}
                    units="dB"
                    width="100%"
                    value={track.duck.amount_db}
                    min={1}
                    max={24}
                    step={1}
                    isWheelEnabled={false}
                    isDisabled={disabled}
                    onChange={(amount_db) => update({ duck: { ...track.duck, amount_db } })}
                  />
                  <NumberInput
                    label={t('soundtrackDuckRelease')}
                    units="s"
                    width="100%"
                    value={track.duck.release_ms / 1000}
                    min={0.01}
                    max={5}
                    step={0.01}
                    isWheelEnabled={false}
                    isDisabled={disabled}
                    onChange={(seconds) =>
                      update({ duck: { ...track.duck, release_ms: Math.round(seconds * 1000) } })
                    }
                  />
                </Grid>
              )}
            </VStack>
          </Collapsible>
        </VStack>
      ) : (
        <EmptyState
          isCompact
          title={t('soundtrackNone')}
          actions={
            <Button
              label={t('soundtrackAdd')}
              size="sm"
              icon={<Icon icon={Plus} size="sm" />}
              isDisabled={disabled}
              onClick={() => void editor.importMedia()}
            />
          }
        />
      )}
    </InspectorPanelSection>
  );
}
