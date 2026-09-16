import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Section } from '@astryxdesign/core/Section';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FolderSnapshot } from '../../../core/folders/folder-types';
import { unwrap } from '../../bridge/client';
import { folderErrorKey } from './errors';
import { FolderRuleForm } from './FolderRuleForm';
import { FolderRules } from './FolderRules';

export function FolderAutomation({ onDirty }: { onDirty: (value: boolean) => void }) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<FolderSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(-1);
  const alive = useRef(true);
  const locked = useRef(false);

  const accept = useCallback((value: FolderSnapshot) => {
    if (!alive.current || value.version < latest.current) return;
    latest.current = value.version;
    setSnapshot(value);
  }, []);

  const report = useCallback((reason: unknown) => {
    if (alive.current) setError(reason instanceof Error ? reason.message : 'WATCH_FAILED');
  }, []);

  const reload = useCallback(async () => {
    try {
      accept(await unwrap(window.reupmatic.folderSnapshot()));
      if (alive.current) setError('');
    } catch (reason) {
      report(reason);
    }
  }, [accept, report]);

  useEffect(() => {
    alive.current = true;
    const off = window.reupmatic.onFolders(accept);
    void reload();
    return () => {
      alive.current = false;
      off();
    };
  }, [accept, reload]);

  async function control(id: string, command: 'start' | 'pause') {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      accept(
        await unwrap(
          command === 'start' ? window.reupmatic.folderStart(id) : window.reupmatic.folderPause(id),
        ),
      );
    } catch (reason) {
      report(reason);
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return (
    <Section
      variant="transparent"
      padding={0}
      className="automation-workspace"
      aria-labelledby="folder-title"
    >
      <div className="workspace-heading">
        <div>
          <h2 id="folder-title">{t('folderTitle')}</h2>
          <p>{t('folderIntro')}</p>
        </div>
        <span>{t('folderLocal')}</span>
      </div>
      <p>{t('folderDeveloperNote')}</p>
      {snapshot && !snapshot.available && (
        <Banner status="warning" title={t('folderUnavailable')} />
      )}
      {error && (
        <Banner
          status="error"
          title={t(folderErrorKey(error))}
          description={<code>{error}</code>}
          endContent={<Button label={t('retryLoad')} onClick={() => void reload()} />}
        />
      )}
      {!snapshot && !error && <p role="status">{t('folderLoading')}</p>}
      <FolderRuleForm enabled={Boolean(snapshot?.available)} onDirty={onDirty} onSaved={accept} />
      {snapshot && <FolderRules snapshot={snapshot} busy={busy} onControl={control} />}
    </Section>
  );
}
