import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SettingsSnapshot } from '../../../core/settings/settings-contracts';
import { presentableSpeechEngines } from '../../../core/speech/engine-capability';
import { unwrap } from '../../bridge/client';
import { LocaleSelect } from '../../shell/LocaleSelect';
import { AiModelRow } from './AiModelRow';
import { diagnosticsErrorKey } from './diagnostics-error-message';
import { LocalModelSetup } from './LocalModelSetup';
import { modelStatusKey } from './model-status';
import { OfferedModels } from './OfferedModels';
import { SpeechProvidersPanel } from './SpeechProvidersPanel';

export type SettingsCategory = 'general' | 'processing' | 'account' | 'advanced';

/**
 * One label column for every Settings row, in every category. Each MetadataList otherwise sizes
 * its own labels, so two groups on the same page align to different edges — the thing that made
 * the categories read as four separate designs.
 */
export const SETTINGS_LABEL = { position: 'start', width: 200 } as const;

// Feeds SettingsWorkspace's tab strip labels (D-57 rehosts Settings in the main window; D-37's
// categories are unchanged).
export const categoryLabel = {
  general: 'settingsGeneral',
  processing: 'settingsProcessing',
  account: 'settingsAccount',
  advanced: 'settingsAdvanced',
} as const;

interface Props {
  category: SettingsCategory;
}

export function SettingsPanel({ category }: Props) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const locked = useRef(false);
  const accept = useCallback((value: SettingsSnapshot) => {
    if (!mounted.current) return;
    setSnapshot((current) =>
      current && (current.preferences?.revision ?? -1) > (value.preferences?.revision ?? -1)
        ? { ...value, preferences: current.preferences }
        : value,
    );
  }, []);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    try {
      const value = await unwrap(window.reupmatic.settingsSnapshot());
      if (request === generation.current) accept(value);
    } catch (reason) {
      if (mounted.current && request === generation.current)
        setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    }
  }, [accept]);

  useEffect(() => {
    mounted.current = true;
    const off = window.reupmatic.onModelsChanged(() => {
      void reload();
    });
    void reload();
    return () => {
      mounted.current = false;
      generation.current += 1;
      off();
    };
  }, [reload]);

  async function changeOutput(clear: boolean) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await unwrap(
        clear ? window.reupmatic.settingsClearOutput() : window.reupmatic.settingsPickOutput(),
      );
      if (value) accept(value);
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <VStack gap={4}>
      {!snapshot && !error && (
        <Text as="p" type="body" role="status">
          {t('settingsLoading')}
        </Text>
      )}
      {error && (
        <Banner
          status="error"
          title={t('settingsError')}
          description={<code>{error}</code>}
          endContent={
            <Button
              label={t('retryLoad')}
              onClick={() => {
                setError('');
                void reload();
              }}
            />
          }
        />
      )}
      {snapshot && (
        <>
          {category === 'general' && (
            <GeneralCategory snapshot={snapshot} busy={busy} onChangeOutput={changeOutput} />
          )}
          {category === 'processing' && <ProcessingCategory snapshot={snapshot} />}
          {category === 'account' && <AccountCategory />}
          {category === 'advanced' && <AdvancedCategory runtime={snapshot.runtime} />}
        </>
      )}
    </VStack>
  );
}

function GeneralCategory({
  snapshot,
  busy,
  onChangeOutput,
}: {
  snapshot: SettingsSnapshot;
  busy: boolean;
  onChangeOutput: (clear: boolean) => void;
}) {
  const { t } = useTranslation();
  const outputDirectory = snapshot.preferences?.default_output_dir;
  return (
    <Section variant="transparent" aria-label={t('settingsGeneral')}>
      <VStack gap={3}>
        {snapshot.preferences_error && (
          <Banner
            status="warning"
            title={t('settingsCorrupt')}
            description={<code>{snapshot.preferences_error}</code>}
          />
        )}
        {/* One row grammar across every Settings category: MetadataList puts each label on the
            left and its value or control on the right. A category gets group headings only when
            it has more than one group (see ProcessingCategory); this one does not. */}
        <MetadataList label={SETTINGS_LABEL}>
          <MetadataListItem label={t('settingsLanguage')}>
            <LocaleSelect />
          </MetadataListItem>
          <MetadataListItem label={t('settingsOutput')}>
            <HStack gap={2} wrap="wrap" vAlign="center">
              {/* The chosen folder is the value. With none chosen there is nothing to state —
                  the two actions already carry it, and Clear default is disabled. */}
              {outputDirectory && (
                <Text as="span" type="body" maxLines={1}>
                  {outputDirectory}
                </Text>
              )}
              <Button
                label={t('settingsChooseOutput')}
                size="sm"
                variant="secondary"
                isDisabled={busy || !snapshot.preferences}
                onClick={() => onChangeOutput(false)}
              />
              <Button
                label={t('settingsClearOutput')}
                size="sm"
                variant="secondary"
                isDisabled={busy || !outputDirectory}
                onClick={() => onChangeOutput(true)}
              />
            </HStack>
          </MetadataListItem>
        </MetadataList>
      </VStack>
    </Section>
  );
}

/**
 * These two rows share one manifest and carry no action of their own — the shared action is a
 * row below them — so they always state their status. `AiModelRow` suppresses a plain "not
 * configured" instead, because its own button already says it.
 */
function ModelStatusText({
  models,
  model,
}: {
  models: SettingsSnapshot['models'];
  model: 'ocr' | 'inpainting';
}) {
  const { t } = useTranslation();
  if (!models) return null;
  return (
    <Text as="span" type="body">
      {t(modelStatusKey(models[model].available, models[model].code))}
    </Text>
  );
}

function ProcessingCategory({ snapshot }: { snapshot: SettingsSnapshot }) {
  const { t } = useTranslation();
  const models = snapshot.models;
  return (
    <Section variant="transparent" aria-label={t('settingsProcessing')}>
      {/* Four groups, one grammar: every group in this category is a heading over its own rows,
          so the reader can tell why there are separate lists. Without the headings the vision
          pair and the speech/translation/voice trio read as one accidental block split in two. */}
      <VStack gap={6}>
        <VStack gap={3}>
          <Heading level={2}>{t('settingsGroupVision')}</Heading>
          <MetadataList label={SETTINGS_LABEL}>
            <MetadataListItem label="OCR">
              <ModelStatusText models={models} model="ocr" />
            </MetadataListItem>
            <MetadataListItem label={t('settingsModelObjectRemoval')}>
              <ModelStatusText models={models} model="inpainting" />
            </MetadataListItem>
            {/* One manifest configures both rows above, so its action is a row in the same list
                rather than a button floating underneath with no label of its own. */}
            <MetadataListItem label={t('settingsVisionManifest')}>
              <LocalModelSetup overridden={snapshot.model_override} />
            </MetadataListItem>
          </MetadataList>
          {snapshot.model_error && (
            <Banner
              status="warning"
              title={t('settingsModelsUnavailable')}
              description={<code>{snapshot.model_error}</code>}
            />
          )}
        </VStack>

        <VStack gap={3}>
          <Heading level={2}>{t('settingsGroupSpeech')}</Heading>
          {/* Speech, translation and TTS each own their own local manifest (not the vision one
              above) — one row per model, each with its own setup action. */}
          <MetadataList label={SETTINGS_LABEL}>
            <AiModelRow
              label={t('settingsModelSpeech')}
              // Several engines can be configured at once (ticket 04); ticket 05 adds
              // the real per-engine picker. Until then this row summarizes the list: ready
              // once any engine is, and otherwise surfaces one representative code. Wires
              // `presentableSpeechEngines`'s `hasCredential` to the real provider store
              // (ticket 08) — a hosted engine only counts as ready once its provider both
              // implements a known protocol (the worker/host already say so via `available`)
              // and holds a credential, never from the credential's value itself.
              fetchStatus={async () => {
                const [status, providers] = await Promise.all([
                  unwrap(window.reupmatic.speechStatus()),
                  unwrap(window.reupmatic.speechProvidersList()),
                ]);
                const credentialed = new Set(
                  providers.flatMap((provider) =>
                    provider.has_credential
                      ? provider.models.map((model) => `${provider.id}:${model.id}`)
                      : [],
                  ),
                );
                const ready =
                  presentableSpeechEngines(status, (engine) => credentialed.has(engine)).length > 0;
                const failing = status.engines.find((entry) => entry.code);
                return {
                  available: ready,
                  code: ready ? null : (failing?.code ?? 'MODEL_MISSING'),
                };
              }}
              configure={() => unwrap(window.reupmatic.speechConfigure())}
              activate={(id) => unwrap(window.reupmatic.speechModelActivate(id))}
              task="recognition"
              subscribe={(callback) => window.reupmatic.onSpeechModelsChanged(callback)}
            />
            <AiModelRow
              label={t('settingsModelTranslation')}
              fetchStatus={() => unwrap(window.reupmatic.translationStatus())}
              configure={() => unwrap(window.reupmatic.translationConfigure())}
              activate={(id) => unwrap(window.reupmatic.speechModelActivate(id))}
              task="translation"
              subscribe={(callback) => window.reupmatic.onTranslationModelsChanged(callback)}
            />
            <AiModelRow
              label={t('settingsModelTts')}
              chooseLabelKey="settingsChooseModelFolder"
              fetchStatus={() => unwrap(window.reupmatic.synthesisStatus())}
              configure={() => unwrap(window.reupmatic.synthesisConfigure())}
              activate={(id) => unwrap(window.reupmatic.speechModelActivate(id))}
              task="synthesis"
              subscribe={(callback) => window.reupmatic.onSynthesisModelsChanged(callback)}
            />
          </MetadataList>
        </VStack>

        <OfferedModels />
        <SpeechProvidersPanel />
      </VStack>
    </Section>
  );
}

function AccountCategory() {
  const { t } = useTranslation();
  return (
    <Section variant="transparent" aria-label={t('settingsAccount')}>
      <MetadataList label={SETTINGS_LABEL}>
        <MetadataListItem label={t('settingsAccountStatus')}>
          {t('settingsAccountNotConnected')}
        </MetadataListItem>
      </MetadataList>
    </Section>
  );
}

function AdvancedCategory({ runtime }: { runtime: SettingsSnapshot['runtime'] }) {
  const { t } = useTranslation();
  return (
    <Section variant="transparent" aria-label={t('settingsAdvanced')}>
      <VStack gap={6}>
        {/* ST-R02's "collapsed area" is the Advanced category itself — a demoted tab below the
            divider, not a primary group. A second disclosure in here only hid four read-only
            facts behind an extra click, so these are plain rows like every other category's. */}
        <VStack gap={3}>
          <Heading level={2}>{t('settingsAdvancedRuntime')}</Heading>
          <MetadataList label={SETTINGS_LABEL}>
            <MetadataListItem label={t('settingsAppVersion')}>{runtime.app}</MetadataListItem>
            <MetadataListItem label={t('settingsNode')}>{runtime.node}</MetadataListItem>
            <MetadataListItem label={t('settingsElectron')}>{runtime.electron}</MetadataListItem>
            <MetadataListItem label={t('settingsPlatform')}>{runtime.platform}</MetadataListItem>
          </MetadataList>
        </VStack>
        <DiagnosticsRow />
      </VStack>
    </Section>
  );
}

/**
 * D-37/D-57 keep diagnostics a secondary control inside the demoted Advanced category, never a
 * new primary group, and D-61 ships no in-app viewer: the folder opens in the OS file manager,
 * and the sanitized bundle is written only where the user points it.
 */
function DiagnosticsRow() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function run(action: 'open' | 'export') {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      if (action === 'open') {
        await unwrap(window.reupmatic.diagnosticsOpenFolder());
        return;
      }
      const written = await unwrap(window.reupmatic.diagnosticsExportBundle());
      if (written) setStatus(t('settingsDiagnosticsExported', { path: written.path }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    } finally {
      setBusy(false);
    }
  }

  return (
    <MetadataList label={SETTINGS_LABEL}>
      <MetadataListItem label={t('settingsDiagnostics')}>
        <VStack gap={1}>
          <HStack gap={2} wrap="wrap" vAlign="center">
            <Button
              label={t('settingsDiagnosticsOpenFolder')}
              size="sm"
              variant="secondary"
              isDisabled={busy}
              onClick={() => void run('open')}
            />
            <Button
              label={t('settingsDiagnosticsExport')}
              size="sm"
              variant="secondary"
              isDisabled={busy}
              onClick={() => void run('export')}
            />
          </HStack>
          {status && (
            <Text as="span" type="supporting" role="status">
              {status}
            </Text>
          )}
          {error && (
            <Text as="span" type="supporting" role="alert">
              {t(diagnosticsErrorKey(error))} <code>{error}</code>
            </Text>
          )}
        </VStack>
      </MetadataListItem>
    </MetadataList>
  );
}
