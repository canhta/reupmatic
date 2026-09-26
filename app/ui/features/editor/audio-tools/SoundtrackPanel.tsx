import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { HStack } from '@astryxdesign/core/HStack';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
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
      <VStack gap={3}>
        {track ? (
          <>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Button
                label={t('soundtrackRemove')}
                isDisabled={disabled}
                onClick={() => editor.changeSoundtrack(undefined)}
              />
            </HStack>
            <Text as="p" type="body">
              {track.source.name} · {(track.source.duration_ms / 1000).toFixed(2)} s
            </Text>
            {url && (
              <audio
                className="soundtrack-preview"
                src={url}
                controls
                preload="metadata"
                aria-label={t('soundtrackListen')}
              />
            )}
            <RadioList
              label={t('soundtrackMode')}
              value={track.mode}
              isDisabled={disabled}
              onChange={(mode) => {
                if (mode === 'replace' || mode === 'mix') update({ mode });
              }}
            >
              <RadioListItem
                value="replace"
                label={t('soundtrackReplace')}
                description={t('soundtrackReplaceHelp')}
              />
              <RadioListItem
                value="mix"
                label={t('soundtrackMix')}
                description={t('soundtrackMixHelp')}
              />
            </RadioList>
            <FormLayout direction="vertical">
              {milliseconds.map((key) => (
                <NumberInput
                  key={key}
                  label={t(`soundtrack_${key}`)}
                  value={track[key] / 1000}
                  min={0}
                  max={key === 'offset_ms' ? 86400 : track.source.duration_ms / 1000}
                  step={0.1}
                  isDisabled={disabled}
                  isWheelEnabled={false}
                  onChange={(value) => update({ [key]: Math.round(value * 1000) })}
                />
              ))}
              <NumberInput
                label={t('soundtrackGain')}
                value={track.gain_db}
                min={-60}
                max={24}
                step={1}
                isWheelEnabled={false}
                isDisabled={disabled}
                onChange={(gain_db) => update({ gain_db })}
              />
            </FormLayout>
            <CheckboxInput
              label={t('soundtrackDuck')}
              value={track.duck.enabled}
              isDisabled={disabled}
              onChange={(enabled) => update({ duck: { ...track.duck, enabled } })}
            />
            {track.duck.enabled && (
              <FormLayout direction="vertical">
                <NumberInput
                  label={t('soundtrackDuckAmount')}
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
              </FormLayout>
            )}
          </>
        ) : (
          <Text as="p" type="body">
            {t('soundtrackNone')}
          </Text>
        )}
      </VStack>
    </InspectorPanelSection>
  );
}
