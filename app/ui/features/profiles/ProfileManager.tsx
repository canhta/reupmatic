import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProcessingProfile, SaveProfile } from '../../../core/profiles/profile-types';
import type { ProcessingRecipe } from '../../../core/processing/recipe';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { useCatalog } from '../catalog/CatalogProvider';
import { useRecordDraft } from '../catalog/useRecordDraft';
import { ProcessingOptions } from '../processing/ProcessingOptions';

function draftOf(profile?: ProcessingProfile): SaveProfile {
  return {
    id: profile?.id ?? crypto.randomUUID(), expected_revision: profile?.revision ?? null,
    name: profile?.name ?? '', notes: profile?.notes ?? '',
    processing: structuredClone(profile?.processing ?? null), archived: profile?.archived ?? false,
  };
}

export function ProfileManager({ currentRecipe }: { currentRecipe?: ProcessingRecipe }) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const confirm = useConfirmation();
  const draft = useRecordDraft(draftOf);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState('');
  const { value } = draft;
  const disabled = catalog.busy || !catalog.snapshot;
  const mediaSpecific = value.processing?.inpaint?.target === 'manual' || Boolean(value.processing?.editing?.trim);
  const profiles = (catalog.snapshot?.profiles ?? []).filter(item => item.name.toLowerCase().includes(search.toLowerCase()));
  const offset = Math.min(page * 25, Math.max(0, Math.ceil(profiles.length / 25) - 1) * 25);

  async function save() {
    const result = await catalog.mutate(() => window.reupmatic.profileSave(value));
    if (result) { draft.replace(draftOf(result)); setMessage(t('catalogSaved')); }
  }

  async function importProfile() {
    if (draft.dirty && !await confirm(t('catalogDiscard'))) return;
    const document = await catalog.mutate(() => window.reupmatic.profileRead());
    if (document) {
      draft.setValue({ ...draftOf(), name: document.name, notes: document.notes, processing: document.processing });
      setMessage(t('profileImportedDraft'));
    }
  }

  return <div className="business-workspace">
    <p>{t('profilesHelp')}</p>
    <div className="business-grid">
      <div className="business-list">
        <div className="business-toolbar">
          <TextInput label={t('catalogSearch')} value={search} onChange={value => { setSearch(value); setPage(0); }} />
          <Button label={t('profileNew')} isDisabled={disabled} onClick={() => void draft.choose(draftOf())} />
          <Button label={t('profileImport')} isDisabled={disabled} onClick={() => void importProfile()} />
        </div>
        {!profiles.length ? <EmptyState title={t('profilesEmpty')} description={t('profilesEmptyHelp')} /> :
          <div className="business-table"><Table density="compact" aria-label={t('profilesTitle')}>
            <TableHeader><TableRow>
              <TableHeaderCell scope="col">{t('catalogName')}</TableHeaderCell>
              <TableHeaderCell scope="col">{t('catalogActions')}</TableHeaderCell>
            </TableRow></TableHeader>
            <TableBody>{profiles.slice(offset, offset + 25).map(profile => <TableRow key={profile.id}>
              <TableCell>{profile.name}{profile.archived && <p>{t('catalogArchived')}</p>}</TableCell>
              <TableCell><div className="action-row">
                <Button label={t('catalogEdit')} isDisabled={disabled} onClick={() => void draft.choose(draftOf(profile))} />
                <Button label={t('profileExport')} isDisabled={disabled} onClick={() => void catalog.mutate(async () => {
                  const result = await window.reupmatic.profileExport(profile.id);
                  if (result.ok && result.data) setMessage(t('profileExported', { name: result.data.name }));
                  return result;
                })} />
              </div></TableCell>
            </TableRow>)}</TableBody>
          </Table></div>}
        <div className="business-pagination">
          <span>{t('catalogCount', { count: profiles.length })}</span>
          <Button label={t('libraryPrevious')} isDisabled={!offset} onClick={() => setPage(Math.max(0, page - 1))} />
          <Button label={t('libraryNext')} isDisabled={offset + 25 >= profiles.length} onClick={() => setPage(page + 1)} />
        </div>
      </div>
      <div className="business-form">
        <h2>{t(value.expected_revision ? 'profileEdit' : 'profileNew')}</h2>
        <TextInput label={t('catalogName')} value={value.name} isDisabled={disabled}
          onChange={name => draft.setValue({ ...value, name })} />
        <TextArea label={t('profileNotes')} value={value.notes} isDisabled={disabled}
          onChange={notes => draft.setValue({ ...value, notes })} />
        <Button label={t('profileCopyEditor')} isDisabled={disabled}
          onClick={() => {
            const processing = structuredClone(currentRecipe ?? null);
            if (processing?.editing?.trim) {
              delete processing.editing.trim;
              if (!Object.keys(processing.editing).length) delete processing.editing;
            }
            draft.setValue({ ...value, processing: processing && Object.keys(processing).length > 1 ? processing : null });
            setMessage(t('profileTrimExcluded'));
          }} />
        <ProcessingOptions value={value.processing ?? undefined} disabled={disabled}
          onChange={processing => draft.setValue({ ...value, processing: processing ?? null })} />
        {mediaSpecific && <Banner status="warning" title={t('profileMediaSpecific')} />}
        <CheckboxInput label={t('catalogArchive')} value={value.archived} isDisabled={disabled}
          onChange={archived => draft.setValue({ ...value, archived })} />
        <div className="action-row">
          <Button label={t('catalogSave')} variant="primary"
            isDisabled={disabled || !value.name.trim() || mediaSpecific || (!draft.dirty && value.expected_revision !== null)}
            onClick={() => void save()} />
          <Button label={t('catalogReset')} isDisabled={disabled || !draft.dirty} onClick={() => void draft.reset()} />
          {draft.dirty && <span>{t('catalogUnsaved')}</span>}
        </div>
        {message && <p role="status">{message}</p>}
      </div>
    </div>
  </div>;
}
