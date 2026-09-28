import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Selector } from '@astryxdesign/core/Selector';
import { StackItem } from '@astryxdesign/core/Stack';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OfferedModel } from '../../../core/speech/model-catalogue';
import { unwrap } from '../../bridge/client';
import { type CommandStatus, PanelRow, PanelStatus } from '../../design-system/Panel';
import { visionErrorKey } from '../vision/error-message';
import { statedModelStatusKey } from './model-status';

export function LocalModelSetup({
  label,
  state,
  overridden = false,
}: {
  label: string;
  state: { available: boolean; code: string | null } | null;
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

  const load = useCallback(async () => {
    try {
      const value = await unwrap(window.reupmatic.speechOfferedModels());
      if (alive.current) {
        setInstalled(value.models.filter((model) => model.task === 'vision' && model.installed));
      }
    } catch {}
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

  const stated = state
    ? statedModelStatusKey(state.available && installed.length === 0, state.code)
    : null;
  const outcome: CommandStatus | null = error
    ? error === 'CANCELLED'
      ? { tone: 'neutral', text: t('visionCancelled') }
      : error === 'MODEL_CONFIG_OVERRIDE'
        ? overridden
          ? null
          : { tone: 'warning', text: t('settingsModelsOverride') }
        : {
            tone: 'error',
            text: `${t('settingsModelsFailure')} · ${t(visionErrorKey(error))}`,
          }
    : saved
      ? { tone: 'success', text: t('settingsModelsSaved') }
      : null;
  const choose = () => void configure();

  return (
    <PanelRow label={label}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            {busy ? (
              <ProgressBar label={t('settingsModelsChecking')} isLabelHidden isIndeterminate />
            ) : installed.length > 0 ? (
              <Selector
                label={label}
                isLabelHidden
                value={
                  installed.some((model) => model.id === selected) ? selected : installed[0].id
                }
                isDisabled={overridden}
                options={installed.map((model) => ({ value: model.id, label: model.id }))}
                onChange={(value) => {
                  if (!value) return;
                  setSelected(value);
                  void activate(value);
                }}
              />
            ) : (
              stated && (
                <PanelStatus
                  tone={stated === 'visionConfigured' ? 'success' : 'warning'}
                  text={t(stated)}
                />
              )
            )}
          </StackItem>
          {busy ? (
            <Button
              label={t(cancelling ? 'cancelling' : 'cancel')}
              size="sm"
              variant="secondary"
              isDisabled={cancelling}
              onClick={() => void cancel()}
            />
          ) : installed.length > 0 ? (
            <MoreMenu
              label={`${label}: ${t('moreActions')}`}
              size="sm"
              alignment="end"
              isDisabled={overridden}
              items={[{ label: t('settingsChooseModelManifest'), onClick: choose }]}
            />
          ) : (
            <Button
              label={t('settingsChooseModelManifest')}
              size="sm"
              variant="secondary"
              isDisabled={overridden}
              onClick={choose}
            />
          )}
        </HStack>
        {installed.length > 0 && stated && !busy && <PanelStatus tone="warning" text={t(stated)} />}
        {overridden && <PanelStatus tone="warning" text={t('settingsModelsOverride')} />}
        {outcome && <PanelStatus tone={outcome.tone} text={outcome.text} />}
      </VStack>
    </PanelRow>
  );
}
