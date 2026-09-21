import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Selector } from '@astryxdesign/core/Selector';
import type { TableColumn } from '@astryxdesign/core/Table';
import {
  paginateData,
  pixel,
  proportional,
  Table,
  useTablePagination,
  useTableSortable,
  useTableSortableState,
} from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProcessingProfile, SaveProfile } from '../../../core/profiles/profile-contracts';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { DetailSurface } from '../../design-system/DetailSurface';
import { useCatalog } from '../catalog/CatalogProvider';
import { useRecordDraft } from '../catalog/useRecordDraft';

const PAGE_SIZE = 25;
type StatusFilter = 'all' | 'active' | 'archived';

// Table's data-driven plugins require T extends Record<string, unknown>; ProcessingProfile is a
// plain named type with no index signature (same pattern as ChannelManager's ChannelRow).
interface ProfileRow extends ProcessingProfile, Record<string, unknown> {}

function draftOf(profile?: ProcessingProfile): SaveProfile {
  return {
    id: profile?.id ?? crypto.randomUUID(),
    expected_revision: profile?.revision ?? null,
    name: profile?.name ?? '',
    notes: profile?.notes ?? '',
    processing: structuredClone(profile?.processing ?? null),
    archived: profile?.archived ?? false,
  };
}

/**
 * The management surface for saved profiles: rename, notes and archive only. A profile's
 * recipe is captured once, from the header's "Save current as profile…" — this component
 * never re-edits it.
 */
export function ProfileManager() {
  const { t, i18n } = useTranslation();
  const catalog = useCatalog();
  const confirm = useConfirmation();
  const draft = useRecordDraft(draftOf);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const { value } = draft;
  const disabled = catalog.busy || !catalog.snapshot;
  const all = (catalog.snapshot?.profiles ?? []) as ProfileRow[];
  const byStatus =
    status === 'all' ? all : all.filter((profile) => profile.archived === (status === 'archived'));
  const filtered = search
    ? byStatus.filter((profile) => profile.name.toLowerCase().includes(search.toLowerCase()))
    : byStatus;

  async function save() {
    const result = await catalog.mutate(() => window.reupmatic.profileSave(value));
    if (result) {
      draft.replace(draftOf(result));
      setMessage(t('catalogSaved'));
      setEditing(false);
    }
  }

  async function importProfile() {
    if (draft.dirty && !(await confirm(t('catalogDiscard')))) return;
    const document = await catalog.mutate(() => window.reupmatic.profileRead());
    if (document) {
      setEditing(true);
      draft.setValue({
        ...draftOf(),
        name: document.name,
        notes: document.notes,
        processing: document.processing,
      });
      setMessage(t('profileImportedDraft'));
    }
  }

  async function closeDetail() {
    if (await draft.discard()) setEditing(false);
  }

  function openProfile(profile?: ProcessingProfile) {
    setEditing(true);
    void draft.choose(draftOf(profile));
  }

  const columns: TableColumn<ProfileRow>[] = [
    {
      key: 'name',
      header: t('catalogName'),
      width: proportional(2),
      sortable: true,
      renderCell: (profile) => (
        <>
          <button type="button" className="business-row-open" onClick={() => openProfile(profile)}>
            {profile.name}
          </button>
          {profile.archived && (
            <Text as="p" type="supporting">
              {t('catalogArchived')}
            </Text>
          )}
        </>
      ),
    },
    {
      key: 'updated_at',
      header: t('profilesUpdated'),
      width: proportional(1),
      sortable: true,
      renderCell: (profile) => new Date(profile.updated_at).toLocaleString(i18n.language),
    },
    {
      key: 'actions',
      header: t('catalogActions'),
      width: pixel(200),
      resizable: false,
      renderCell: (profile) => (
        <div className="action-row">
          <Button
            label={t('catalogEdit')}
            isDisabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              openProfile(profile);
            }}
          />
          <Button
            label={t('profileExport')}
            isDisabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              void catalog.mutate(async () => {
                const result = await window.reupmatic.profileExport(profile.id);
                if (result.ok && result.data)
                  setMessage(t('profileExported', { name: result.data.name }));
                return result;
              });
            }}
          />
        </div>
      ),
    },
  ];

  const { sortedData, sortConfig } = useTableSortableState<ProfileRow>({
    data: filtered,
    defaultSort: [{ sortKey: 'name', direction: 'ascending' }],
  });
  const sortPlugin = useTableSortable<ProfileRow>(sortConfig);
  const showPagination = sortedData.length > PAGE_SIZE;
  const paginationPlugin = useTablePagination<ProfileRow>({
    page,
    onPageChange: setPage,
    totalItems: sortedData.length,
    pageSize: PAGE_SIZE,
    variant: 'count',
  });
  const pageData = showPagination ? paginateData(sortedData, page, PAGE_SIZE) : sortedData;

  return (
    <div className="business-workspace">
      <div className="business-grid">
        <div className="business-list">
          <Toolbar
            label={t('profilesTitle')}
            size="sm"
            startContent={
              <div className="action-row">
                <TextInput
                  label={t('catalogSearch')}
                  isLabelHidden
                  placeholder={t('catalogSearch')}
                  startIcon="search"
                  hasClear
                  value={search}
                  onChange={(value) => {
                    setSearch(value);
                    setPage(1);
                  }}
                />
                <Selector
                  label={t('profilesFilterStatus')}
                  size="sm"
                  value={status}
                  onChange={(next) => {
                    if (next === 'all' || next === 'active' || next === 'archived') {
                      setStatus(next);
                      setPage(1);
                    }
                  }}
                  options={[
                    { value: 'active', label: t('profilesFilterActive') },
                    { value: 'archived', label: t('profilesFilterArchived') },
                    { value: 'all', label: t('profilesFilterAll') },
                  ]}
                />
              </div>
            }
            endContent={
              <div className="action-row">
                {all.length > 0 && (
                  <Text type="supporting">{t('profilesCount', { count: sortedData.length })}</Text>
                )}
                <Button
                  label={t('profileNew')}
                  variant="primary"
                  isDisabled={disabled}
                  onClick={() => openProfile()}
                />
                <Button
                  label={t('profileImport')}
                  isDisabled={disabled}
                  onClick={() => void importProfile()}
                />
              </div>
            }
          />
          {!all.length ? (
            <EmptyState title={t('profilesEmpty')} />
          ) : !filtered.length ? (
            <EmptyState
              title={t('profilesNoMatches')}
              actions={
                <Button
                  label={t('catalogClearSearch')}
                  onClick={() => {
                    setSearch('');
                    setStatus('all');
                  }}
                />
              }
            />
          ) : (
            <Table
              density="compact"
              aria-label={t('profilesTitle')}
              idKey="id"
              data={pageData}
              columns={columns}
              plugins={{
                sort: sortPlugin,
                ...(showPagination ? { pagination: paginationPlugin } : {}),
              }}
            />
          )}
        </div>
        <DetailSurface
          open={editing}
          label={t(value.expected_revision ? 'profileEdit' : 'profileNew')}
          onClose={() => void closeDetail()}
        >
          <div className="business-form">
            <TextInput
              label={t('catalogName')}
              value={value.name}
              isDisabled={disabled}
              onChange={(name) => draft.setValue({ ...value, name })}
            />
            <TextArea
              label={t('profileNotes')}
              value={value.notes}
              isDisabled={disabled}
              onChange={(notes) => draft.setValue({ ...value, notes })}
            />
            <CheckboxInput
              label={t('catalogArchive')}
              value={value.archived}
              isDisabled={disabled}
              onChange={(archived) => draft.setValue({ ...value, archived })}
            />
            <div className="action-row">
              <Button
                label={t('catalogSave')}
                variant="primary"
                isDisabled={
                  disabled ||
                  !value.name.trim() ||
                  (!draft.dirty && value.expected_revision !== null)
                }
                onClick={() => void save()}
              />
              <Button
                label={t('catalogReset')}
                isDisabled={disabled || !draft.dirty}
                onClick={() => void draft.reset()}
              />
              {draft.dirty && <Text type="supporting">{t('catalogUnsaved')}</Text>}
            </div>
            {message && (
              <Text as="p" type="body" role="status">
                {message}
              </Text>
            )}
          </div>
        </DetailSurface>
      </div>
    </div>
  );
}
