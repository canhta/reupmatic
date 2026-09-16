import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { unwrap } from '../../bridge/client';
import { visionErrorKey } from '../vision/i18n';

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
  const locked = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

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
    <div className="local-model-setup">
      <p>{t('settingsModelsIntro')}</p>
      {overridden && <Banner status="warning" title={t('settingsModelsOverride')} />}
      <div className="action-row">
        <Button
          label={t('settingsChooseModels')}
          isDisabled={disabled || overridden || busy}
          onClick={() => void configure()}
        />
        {busy && (
          <Button
            label={t(cancelling ? 'cancelling' : 'cancel')}
            isDisabled={cancelling}
            onClick={() => void cancel()}
          />
        )}
      </div>
      {busy && <ProgressBar label={t('settingsModelsChecking')} isIndeterminate />}
      {saved && <p role="status">{t('settingsModelsSaved')}</p>}
      {error && (
        <Banner
          status={error === 'CANCELLED' ? 'info' : 'error'}
          title={t(
            error === 'MODEL_CONFIG_OVERRIDE' ? 'settingsModelsOverride' : 'settingsModelsFailure',
          )}
          description={
            <span>
              {t(visionErrorKey(error))} <code>{error}</code>
            </span>
          }
        />
      )}
      <p className="field-help">{t('settingsModelsGuide')}</p>
    </div>
  );
}
