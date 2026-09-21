import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ModelTask,
  OfferedCatalogue,
  OfferedModel,
} from '../../../core/speech/model-catalogue';
import { unwrap } from '../../bridge/client';
import type { MessageKey } from '../../locales/message-key';
import { statedModelStatusKey } from './model-status';

interface ModelState {
  available: boolean;
  code: string | null;
}

const CHOOSE_FILE = '__choose_file__';

export function AiModelRow({
  label,
  fetchStatus,
  configure,
  activate,
  subscribe,
  task,
  chooseLabelKey = 'settingsChooseModelManifest',
}: {
  label: string;
  fetchStatus: () => Promise<ModelState>;
  configure: () => Promise<unknown>;
  activate?: (catalogueId: string) => Promise<unknown>;
  subscribe?: (callback: () => void) => () => void;
  task?: ModelTask;
  chooseLabelKey?: MessageKey;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ModelState | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [catalogue, setCatalogue] = useState<OfferedCatalogue | null>(null);
  const [selected, setSelected] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const value = await fetchStatus();
      if (alive.current) setStatus(value);
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    } finally {
      if (alive.current) setChecking(false);
    }
  }, [fetchStatus]);
  const reloadCatalogue = useCallback(async () => {
    if (!task) return;
    try {
      const value = await unwrap(window.reupmatic.speechOfferedModels());
      if (alive.current) setCatalogue(value);
    } catch {}
  }, [task]);
  useEffect(() => {
    void refresh();
    void reloadCatalogue();
  }, [refresh, reloadCatalogue]);
  useEffect(() => {
    if (!subscribe) return undefined;
    return subscribe(() => {
      void refresh();
      void reloadCatalogue();
    });
  }, [subscribe, refresh, reloadCatalogue]);

  const installed: OfferedModel[] = useMemo(
    () =>
      task
        ? (catalogue?.models ?? []).filter((model) => model.task === task && model.installed)
        : [],
    [catalogue, task],
  );
  useEffect(() => {
    if (installed.length && !installed.some((model) => model.id === selected)) {
      setSelected(installed[0].id);
    }
  }, [installed, selected]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    } finally {
      if (alive.current) setBusy(false);
    }
    await refresh();
    await reloadCatalogue();
  }

  const control =
    installed.length > 0 ? (
      <Selector
        label={label}
        isLabelHidden
        value={installed.some((model) => model.id === selected) ? selected : installed[0].id}
        isDisabled={busy || checking}
        options={[
          ...installed.map((model) => ({
            value: model.id,
            label: model.id,
          })),
          { value: CHOOSE_FILE, label: t(chooseLabelKey) },
        ]}
        onChange={(value) => {
          if (value === CHOOSE_FILE) void run(configure);
          else if (value && activate) void run(() => activate(value));
        }}
      />
    ) : (
      <Button
        size="sm"
        variant="secondary"
        label={`${label}: ${t(chooseLabelKey)}`}
        isDisabled={busy}
        onClick={() => void run(configure)}
      >
        {t(chooseLabelKey)}
      </Button>
    );

  return (
    <MetadataListItem label={label}>
      <VStack gap={2}>
        <HStack gap={2} wrap="wrap" vAlign="center">
          {(() => {
            const stated = checking
              ? installed.length > 0
                ? null
                : 'visionChecking'
              : statedModelStatusKey(
                  Boolean(status?.available) && installed.length === 0,
                  status?.code ?? null,
                );
            return stated ? (
              <Text as="span" type="body">
                {t(stated)}
              </Text>
            ) : null;
          })()}
          {control}
        </HStack>
        {error && (
          <Text as="p" type="supporting" role="alert">
            {error}
          </Text>
        )}
      </VStack>
    </MetadataListItem>
  );
}
