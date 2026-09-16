import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Divider } from '@astryxdesign/core/Divider';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Section } from '@astryxdesign/core/Section';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SettingsSnapshot } from '../../../core/settings/settings-types';
import { unwrap } from '../../bridge/client';
import { LocaleSelect } from '../../shell/LocaleSelect';
import { visionErrorKey } from '../vision/i18n';
import { LocalModelSetup } from './LocalModelSetup';

export function SettingsPanel() {
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
    <div className="settings-workspace">
      {!snapshot && !error && <p role="status">{t('settingsLoading')}</p>}
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
      <Section variant="transparent" padding={0} aria-label={t('settingsGeneral')}>
        <h2>{t('settingsGeneral')}</h2>
        <LocaleSelect />
        {snapshot?.preferences_error && (
          <Banner
            status="warning"
            title={t('settingsCorrupt')}
            description={<code>{snapshot.preferences_error}</code>}
          />
        )}
        <MetadataList label={{ position: 'top' }}>
          <MetadataListItem label={t('settingsOutput')}>
            <span className="settings-path">
              {snapshot?.preferences?.default_output_dir ?? t('settingsNoOutput')}
            </span>
          </MetadataListItem>
        </MetadataList>
        <p>{t('settingsOutputHelp')}</p>
        <div className="action-row">
          <Button
            label={t('settingsChooseOutput')}
            isDisabled={busy || !snapshot?.preferences}
            onClick={() => void changeOutput(false)}
          />
          <Button
            label={t('settingsClearOutput')}
            isDisabled={busy || !snapshot?.preferences?.default_output_dir}
            onClick={() => void changeOutput(true)}
          />
        </div>
      </Section>
      <Divider />
      <Section variant="transparent" padding={0} aria-label={t('settingsProcessing')}>
        <h2>{t('settingsProcessing')}</h2>
        {snapshot?.models && (
          <MetadataList label={{ position: 'top' }}>
            <MetadataListItem label="OCR">
              {t(
                snapshot.models.ocr.available
                  ? 'visionConfigured'
                  : visionErrorKey(snapshot.models.ocr.code ?? 'MODEL_MISSING'),
              )}
            </MetadataListItem>
            <MetadataListItem label="LaMa">
              {t(
                snapshot.models.inpainting.available
                  ? 'visionConfigured'
                  : visionErrorKey(snapshot.models.inpainting.code ?? 'MODEL_MISSING'),
              )}
            </MetadataListItem>
          </MetadataList>
        )}
        {snapshot?.model_error && (
          <Banner
            status="warning"
            title={t('settingsModelsUnavailable')}
            description={<code>{snapshot.model_error}</code>}
          />
        )}
        <p className="field-help">{t('settingsModelsUnverified')}</p>
        <LocalModelSetup overridden={snapshot?.model_override} />
      </Section>
      <Divider />
      <Section variant="transparent" padding={0} aria-label={t('settingsAccount')}>
        <h2>{t('settingsAccount')}</h2>
        <Banner
          status="info"
          title={t('settingsAccountUnavailable')}
          description={t('settingsAccountHelp')}
        />
      </Section>
      <Collapsible trigger={t('settingsAdvanced')} defaultIsOpen={false}>
        {snapshot && (
          <MetadataList label={{ position: 'top' }}>
            <MetadataListItem label={t('settingsAppVersion')}>
              {snapshot.runtime.app}
            </MetadataListItem>
            <MetadataListItem label={t('settingsNode')}>{snapshot.runtime.node}</MetadataListItem>
            <MetadataListItem label={t('settingsElectron')}>
              {snapshot.runtime.electron}
            </MetadataListItem>
            <MetadataListItem label={t('settingsPlatform')}>
              {snapshot.runtime.platform}
            </MetadataListItem>
          </MetadataList>
        )}
      </Collapsible>
    </div>
  );
}
