import { ProfilePicker } from '../profiles/ProfilePicker';
import { parseProcessingRecipe, type ProcessingRecipe } from '../../../core/processing/recipe';
import { ProcessingOptions } from '../processing/ProcessingOptions';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Section } from '@astryxdesign/core/Section';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FolderSnapshot } from '../../../core/folders/folder-types';
import { unwrap } from '../../bridge/client';
import { folderErrorKey } from './errors';

type PickedFolder = { directory_id: string; name: string };
interface Props {
  enabled: boolean;
  onDirty: (dirty: boolean) => void;
  onSaved: (snapshot: FolderSnapshot) => void;
}

export function FolderRuleForm({ enabled, onDirty, onSaved }: Props) {
  const { t } = useTranslation();
  const [processing, setProcessing] = useState<ProcessingRecipe>();
  const [source, setSource] = useState<PickedFolder | null>(null);
  const [output, setOutput] = useState<PickedFolder | null>(null);
  const [scope, setScope] = useState('');
  const [recursive, setRecursive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const locked = useRef(false);

  useEffect(() => {
    onDirty(Boolean(source || output || scope || recursive || processing));
  }, [source, output, scope, recursive, processing, onDirty]);

  async function action(work: () => Promise<void>) {
    if (locked.current || !enabled) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await work();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'WATCH_FAILED');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function save() {
    if (!source || !output || !scope) return;
    await action(async () => {
      if (processing) parseProcessingRecipe(processing);
      const snapshot = await unwrap(window.reupmatic.folderCreate({
        source_id: source.directory_id,
        output_id: output.directory_id,
        include_existing: scope === 'all',
        recursive,
        ...(processing ? { processing } : {}),
      }));
      onSaved(snapshot);
      setSource(null);
      setOutput(null);
      setScope('');
      setRecursive(false);
      setProcessing(undefined);
      setSaved(true);
    });
  }

  return (
    <Section variant="transparent" padding={0} aria-label={t('folderNew')}>
      <form className="folder-form" onSubmit={event => { event.preventDefault(); void save(); }}>
        <h2>{t('folderNew')}</h2>
        <div className="folder-flow">
          <div className="folder-location">
            <h3>{t('folderSource')}</h3>
            <p className="folder-path">{source?.name ?? t('folderSourceEmpty')}</p>
            <Button label={t('folderPickSource')} type="button" isDisabled={busy || !enabled}
              onClick={() => void action(async () => {
                const picked = await unwrap(window.reupmatic.folderPickSource());
                if (picked) setSource(picked);
              })} />
          </div>
          <div className="folder-location">
            <h3>{t('folderOutput')}</h3>
            <p className="folder-path">{output?.name ?? t('folderOutputEmpty')}</p>
            <Button label={t('folderPickOutput')} type="button" isDisabled={busy || !enabled}
              onClick={() => void action(async () => {
                const picked = await unwrap(window.reupmatic.folderPickOutput());
                if (picked) setOutput(picked);
              })} />
          </div>
        </div>
        <p>{t('folderRenderScope')}</p>
        <div className="folder-options">
          <RadioList label={t('folderFirstRun')} description={t('folderChooseScope')}
            value={scope} onChange={setScope} isRequired isDisabled={busy || !enabled}>
            <RadioListItem value="new" label={t('folderNewOnly')} />
            <RadioListItem value="all" label={t('folderAllExisting')} />
          </RadioList>
          <CheckboxInput label={t('folderRecursive')} value={recursive}
            onChange={setRecursive} isDisabled={busy || !enabled} />
        </div>
        <ProfilePicker onApply={setProcessing} disabled={busy || !enabled} />
        <ProcessingOptions value={processing} onChange={setProcessing} disabled={busy || !enabled} />
        <div className="form-actions">
          <p className="field-help">{t('folderSaveHint')}</p>
          <Button label={t('folderSave')} variant="primary" type="submit"
            isDisabled={busy || !enabled || !source || !output || !scope} />
        </div>
        {error && <Banner status="error" title={t(folderErrorKey(error))}
          description={<code>{error}</code>} />}
        {saved && <p role="status">{t('folderSaved')}</p>}
      </form>
    </Section>
  );
}
