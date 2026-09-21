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

/** The dropdown's last option: the hand-written manifest/folder picker D-56 keeps working. */
const CHOOSE_FILE = '__choose_file__';

/**
 * One row of `ProcessingCategory` for a model that owns its own local
 * manifest (speech, translation, TTS — vision's OCR/inpainting stay the
 * existing single `LocalModelSetup` manifest). Each row fetches and
 * configures through that model's own bridge calls directly (the same ones
 * the Editor's generators already used) rather than a shared endpoint,
 * since the app has no single manifest covering every local model — this
 * is Settings surfacing each domain's own status/configure pair as one
 * list row with a status + "Choose…", not a new backend concept.
 *
 * When the row names a catalogue `task`, the control becomes a **dropdown of the models already
 * downloaded** for it (D-56/D-65), with the manifest/folder picker as its last option, so a user
 * who downloaded a model picks it by name instead of finding a file. A row with no catalogue (the
 * translation manifest) keeps the plain "Choose…" button.
 */
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
  // Points an engine at a downloaded catalogue entry's own manifest — only a row with `task` has it.
  activate?: (catalogueId: string) => Promise<unknown>;
  // Refetches on an external change this row doesn't itself cause — e.g. the speech row after
  // a provider/model edit made from `SpeechProvidersPanel`, via `onSpeechModelsChanged`.
  subscribe?: (callback: () => void) => () => void;
  // A row backed by the offered-model catalogue lists downloaded models for this task.
  task?: ModelTask;
  // A row whose setup action selects a folder rather than a JSON manifest says so.
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
    } catch {
      // The row's own status already states the failure; the dropdown simply stays absent and the
      // "Choose…" button remains as the fallback.
    }
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

  // Memoised: a fresh array every render would re-run the selection effect below on every render.
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
        // Visible text stays this row's own setup verb; the accessible name adds the row's
        // label so multiple rows (speech/translation/TTS, one each) never collide on the same
        // name for assistive tech or tests.
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
            // With the model dropdown shown, the entry's own name is the ready state — a plain
            // "Ready" beside it says nothing the selector does not. A real fault is still named.
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
