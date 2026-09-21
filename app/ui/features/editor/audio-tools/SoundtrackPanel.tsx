import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Text } from '@astryxdesign/core/Text';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_SOUNDTRACK_DUCK,
  parseSoundtrack,
  type Soundtrack,
} from '../../../../core/editing/soundtrack';
import { unwrap } from '../../../bridge/client';
import { InspectorPanelSection } from '../../../design-system/InspectorPanelSection';
import { useEditor } from '../EditorContext';

const milliseconds = ['start_ms', 'end_ms', 'offset_ms', 'fade_in_ms', 'fade_out_ms'] as const;

export function SoundtrackPanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const current = JSON.stringify(editor.soundtrack ?? null);
  const [baseline, setBaseline] = useState(current);
  const [draft, setDraft] = useState<Soundtrack | undefined>(editor.soundtrack);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const dirty = JSON.stringify(draft ?? null) !== baseline;
  const stale = baseline !== current;
  const disabled = editor.busy || editor.opening;

  const reload = useCallback(() => {
    setDraft(editor.soundtrack);
    setBaseline(current);
    setError('');
  }, [editor.soundtrack, current]);
  useEffect(() => {
    if (!dirty && stale) reload();
  }, [dirty, stale, reload]);
  const source = draft?.source;
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
        .catch((reason) => {
          if (alive) setError(reason.message);
        });
    }
    return () => {
      alive = false;
    };
  }, [source?.path, source?.sha256, source?.duration_ms, source]);

  function apply() {
    try {
      if (stale) throw new Error('STALE_OPERATION');
      const value = draft ? parseSoundtrack(draft) : undefined;
      editor.changeSoundtrack(value);
      // Store the parsed shape back into the draft: dirty is a JSON comparison, so the draft must
      // share the field order the canonical parser produces or Apply would never look applied.
      setDraft(value);
      setBaseline(JSON.stringify(value ?? null));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'INVALID_SOUNDTRACK');
    }
  }
  return (
    <InspectorPanelSection title={t('soundtrackTitle')}>
      <div className="action-row">
        <Button
          label={t('soundtrackRemove')}
          isDisabled={disabled || !draft}
          onClick={() => setDraft(undefined)}
        />
      </div>
      {draft ? (
        <>
          <Text as="p" type="body">
            {draft.source.name} · {(draft.source.duration_ms / 1000).toFixed(2)} s
          </Text>
          <Text as="p" type="supporting">
            {t('soundtrackHelp')}
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
          <Text as="p" type="supporting">
            {t('soundtrackListenHelp')}
          </Text>
          <RadioList
            label={t('soundtrackMode')}
            value={draft.mode}
            isDisabled={disabled}
            onChange={(mode) => {
              if (mode === 'replace' || mode === 'mix') setDraft({ ...draft, mode });
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
          <div className="vision-fields">
            {milliseconds.map((key) => (
              <NumberInput
                key={key}
                label={t(`soundtrack_${key}`)}
                value={draft[key] / 1000}
                min={0}
                max={key === 'offset_ms' ? 86400 : draft.source.duration_ms / 1000}
                step={0.1}
                isDisabled={disabled}
                isWheelEnabled={false}
                onChange={(value) => setDraft({ ...draft, [key]: Math.round(value * 1000) })}
              />
            ))}
            <NumberInput
              label={t('soundtrackGain')}
              value={draft.gain_db}
              min={-60}
              max={24}
              step={1}
              isWheelEnabled={false}
              isDisabled={disabled}
              onChange={(gain_db) => setDraft({ ...draft, gain_db })}
            />
          </div>
          <CheckboxInput
            label={t('soundtrackDuck')}
            value={draft.duck.enabled}
            isDisabled={disabled}
            onChange={(enabled) => setDraft({ ...draft, duck: { ...draft.duck, enabled } })}
          />
          {draft.duck.enabled && (
            <div className="vision-fields">
              <NumberInput
                label={t('soundtrackDuckAmount')}
                value={draft.duck.amount_db}
                min={1}
                max={24}
                step={1}
                isWheelEnabled={false}
                isDisabled={disabled}
                onChange={(amount_db) => setDraft({ ...draft, duck: { ...draft.duck, amount_db } })}
              />
              <NumberInput
                label={t('soundtrackDuckRelease')}
                value={draft.duck.release_ms / 1000}
                min={0.01}
                max={5}
                step={0.01}
                isWheelEnabled={false}
                isDisabled={disabled}
                onChange={(seconds) =>
                  setDraft({
                    ...draft,
                    duck: {
                      ...draft.duck,
                      release_ms: Math.max(10, Math.min(5000, Math.round(seconds * 1000))),
                    },
                  })
                }
              />
            </div>
          )}
          {draft.duck.enabled && (
            <Text as="p" type="supporting">
              {t('soundtrackDuckHelp', { sample: t('sample') })}
            </Text>
          )}
        </>
      ) : (
        <Text as="p" type="body">
          {t('soundtrackNone')}
        </Text>
      )}
      {dirty && (
        <Text as="p" type="body" role="status">
          {t('soundtrackDraft')}
        </Text>
      )}
      {(error || stale) && (
        <Banner
          status="error"
          title={t(stale ? 'soundtrackStale' : 'soundtrackInvalid')}
          description={error ? <code>{error}</code> : undefined}
        />
      )}
      <div className="action-row">
        <Button
          label={t('soundtrackApply')}
          variant="primary"
          isDisabled={disabled || !dirty || stale}
          onClick={apply}
        />
        <Button
          label={t('soundtrackReload')}
          isDisabled={disabled || (!dirty && !stale)}
          onClick={reload}
        />
      </div>
    </InspectorPanelSection>
  );
}
