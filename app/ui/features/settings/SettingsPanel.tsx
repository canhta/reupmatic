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

export const SETTINGS_LABEL = { position: 'start', width: 200 } as const;

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
        {}
        <MetadataList label={SETTINGS_LABEL}>
          <MetadataListItem label={t('settingsLanguage')}>
            <LocaleSelect />
          </MetadataListItem>
          <MetadataListItem label={t('settingsOutput')}>
            <HStack gap={2} wrap="wrap" vAlign="center">
              {}
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
      {}
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
            {}
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
          {}
          <MetadataList label={SETTINGS_LABEL}>
            <AiModelRow
              label={t('settingsModelSpeech')}
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
        {}
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
