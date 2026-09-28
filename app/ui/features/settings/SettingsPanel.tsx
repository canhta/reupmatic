import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SettingsSnapshot } from '../../../core/settings/settings-contracts';
import { presentableSpeechEngines } from '../../../core/speech/engine-capability';
import { unwrap } from '../../bridge/client';
import {
  CommandFooter,
  PanelRow,
  PanelRows,
  PanelSection,
  PanelSections,
  ValueRow,
} from '../../design-system/Panel';
import { PathRow } from '../../design-system/PanelControls';
import { LocaleSelect } from '../../shell/LocaleSelect';
import { AiModelRow } from './AiModelRow';
import { diagnosticsErrorKey } from './diagnostics-error-message';
import { LocalModelSetup } from './LocalModelSetup';
import { OfferedModels } from './OfferedModels';
import { SpeechProvidersPanel } from './SpeechProvidersPanel';
import { VoicesPanel } from './VoicesPanel';

export type SettingsCategory = 'general' | 'processing' | 'account' | 'advanced';

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
        <PanelRows>
          <PanelRow label={t('settingsLanguage')}>
            <LocaleSelect />
          </PanelRow>
          <PathRow
            label={t('settingsOutput')}
            value={outputDirectory}
            chooseLabel={t('settingsChooseOutput')}
            isDisabled={busy || !snapshot.preferences}
            onChoose={() => onChangeOutput(false)}
            onClear={() => onChangeOutput(true)}
          />
        </PanelRows>
      </VStack>
    </Section>
  );
}

async function fetchSpeechStatus() {
  const [status, providers] = await Promise.all([
    unwrap(window.reupmatic.speechStatus()),
    unwrap(window.reupmatic.speechProvidersList()),
  ]);
  const credentialed = new Set(
    providers.flatMap((provider) =>
      provider.has_credential ? provider.models.map((model) => `${provider.id}:${model.id}`) : [],
    ),
  );
  const ready = presentableSpeechEngines(status, (engine) => credentialed.has(engine)).length > 0;
  const failing = status.engines.find((entry) => entry.code);
  return { available: ready, code: ready ? null : (failing?.code ?? 'MODEL_MISSING') };
}

function ProcessingCategory({ snapshot }: { snapshot: SettingsSnapshot }) {
  const { t } = useTranslation();
  return (
    <Section variant="transparent" aria-label={t('settingsProcessing')}>
      <PanelSections>
        <PanelSection
          title={t('settingsGroupVision')}
          status={
            snapshot.model_error
              ? {
                  tone: 'warning',
                  text: `${t('settingsModelsUnavailable')} · ${snapshot.model_error}`,
                }
              : null
          }
        >
          <PanelRows>
            <LocalModelSetup
              label="OCR"
              state={snapshot.models?.ocr ?? null}
              overridden={snapshot.model_override}
            />
          </PanelRows>
        </PanelSection>
        <PanelSection title={t('settingsGroupSpeech')}>
          <PanelRows>
            <AiModelRow
              label={t('settingsModelSpeech')}
              fetchStatus={fetchSpeechStatus}
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
          </PanelRows>
        </PanelSection>
        <OfferedModels />
        <SpeechProvidersPanel />
        <VoicesPanel />
      </PanelSections>
    </Section>
  );
}

function AccountCategory() {
  const { t } = useTranslation();
  return (
    <Section variant="transparent" aria-label={t('settingsAccount')}>
      <PanelRows>
        <ValueRow label={t('settingsAccountStatus')}>{t('settingsAccountNotConnected')}</ValueRow>
      </PanelRows>
    </Section>
  );
}

function AdvancedCategory({ runtime }: { runtime: SettingsSnapshot['runtime'] }) {
  const { t } = useTranslation();
  const facts = [
    ['settingsAppVersion', runtime.app],
    ['settingsNode', runtime.node],
    ['settingsElectron', runtime.electron],
    ['settingsPlatform', runtime.platform],
  ] as const;
  return (
    <Section variant="transparent" aria-label={t('settingsAdvanced')}>
      <PanelSections>
        <PanelSection title={t('settingsAdvancedRuntime')}>
          <PanelRows>
            {facts.map(([key, value]) => (
              <ValueRow key={key} label={t(key)}>
                {value}
              </ValueRow>
            ))}
          </PanelRows>
        </PanelSection>
        <DiagnosticsSection />
      </PanelSections>
    </Section>
  );
}

function DiagnosticsSection() {
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
    <PanelSection title={t('settingsDiagnostics')}>
      <CommandFooter
        status={
          error
            ? { tone: 'error', text: `${t(diagnosticsErrorKey(error))} · ${error}` }
            : status
              ? { tone: 'success', text: status }
              : null
        }
        menuLabel={`${t('settingsDiagnostics')}: ${t('moreActions')}`}
        menu={[
          {
            label: t('settingsDiagnosticsOpenFolder'),
            isDisabled: busy,
            onClick: () => void run('open'),
          },
        ]}
      >
        <Button
          label={t('settingsDiagnosticsExport')}
          variant="primary"
          size="sm"
          isDisabled={busy}
          onClick={() => void run('export')}
        />
      </CommandFooter>
    </PanelSection>
  );
}
