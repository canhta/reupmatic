import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OfferedModel } from '../../../core/speech/model-catalogue';
import { unwrap } from '../../bridge/client';
import { visionErrorKey } from '../vision/error-message';

/** The dropdown's last option: the hand-written manifest picker D-56 keeps working. */
const CHOOSE_FILE = '__choose_file__';

export function LocalModelSetup({
  disabled = false,
  overridden = false,
}: {
  disabled?: boolean;
  overridden?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [installed, setInstalled] = useState<OfferedModel[]>([]);
  const [selected, setSelected] = useState('');
  const locked = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The vision entries already downloaded, so the row can offer them by name (D-66) instead of
  // only a manifest picker. A vision install pushes `models-changed`, the same event the rest of
  // this screen listens on.
  const load = useCallback(async () => {
    try {
      const value = await unwrap(window.reupmatic.speechOfferedModels());
      if (alive.current) {
        setInstalled(value.models.filter((model) => model.task === 'vision' && model.installed));
      }
    } catch {
      // The row's own status states the failure; the picker simply stays absent.
    }
  }, []);
  useEffect(() => {
    void load();
    const off = window.reupmatic.onModelsChanged(() => void load());
    const offSpeech = window.reupmatic.onSpeechModelsChanged(() => void load());
    return () => {
      off();
      offSpeech();
    };
  }, [load]);

  async function configure() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setCancelling(false);
    setError('');
    setSaved(false);
    try {
      const result = await unwrap(window.reupmatic.settingsPickModels());
      if (alive.current) setSaved(Boolean(result));
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
      void load();
    }
  }

  async function activate(id: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setCancelling(false);
    setError('');
    setSaved(false);
    try {
      await unwrap(window.reupmatic.speechModelActivate(id));
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
      void load();
    }
  }

  async function cancel() {
    setCancelling(true);
    try {
      const result = await unwrap(window.reupmatic.settingsCancelModels());
      if (alive.current && !result.requested) setCancelling(false);
    } catch (reason) {
      if (alive.current) {
        setCancelling(false);
        setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
      }
    }
  }

  return (
    <VStack gap={3}>
      {overridden && <Banner status="warning" title={t('settingsModelsOverride')} />}
      <HStack gap={2} wrap="wrap" vAlign="center">
        {installed.length > 0 ? (
          <Selector
            label={t('settingsVisionManifest')}
            isLabelHidden
            value={installed.some((model) => model.id === selected) ? selected : installed[0].id}
            isDisabled={disabled || overridden || busy}
            options={[
              ...installed.map((model) => ({ value: model.id, label: model.id })),
              { value: CHOOSE_FILE, label: t('settingsChooseModelManifest') },
            ]}
            onChange={(value) => {
              if (value === CHOOSE_FILE) void configure();
              else if (value) {
                setSelected(value);
                void activate(value);
              }
            }}
          />
        ) : (
          <Button
            label={t('settingsChooseModelManifest')}
            size="sm"
            variant="secondary"
            isDisabled={disabled || overridden || busy}
            onClick={() => void configure()}
          />
        )}
        {busy && (
          <Button
            label={t(cancelling ? 'cancelling' : 'cancel')}
            size="sm"
            variant="secondary"
            isDisabled={cancelling}
            onClick={() => void cancel()}
          />
        )}
      </HStack>
      {busy && <ProgressBar label={t('settingsModelsChecking')} isIndeterminate />}
      {saved && (
        <Text as="p" type="supporting" role="status">
          {t('settingsModelsSaved')}
        </Text>
      )}
      {error && (
        <Banner
          status={error === 'CANCELLED' ? 'info' : 'error'}
          title={t(
            error === 'MODEL_CONFIG_OVERRIDE' ? 'settingsModelsOverride' : 'settingsModelsFailure',
          )}
          description={
            <Text as="span" type="supporting">
              {t(visionErrorKey(error))} <code>{error}</code>
            </Text>
          }
        />
      )}
    </VStack>
  );
}
