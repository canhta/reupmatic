import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import type { PowerSearchFilter } from '@astryxdesign/core/PowerSearch';
import { usePowerSearchConfig } from '@astryxdesign/core/PowerSearch';
import { Selector } from '@astryxdesign/core/Selector';
import type { TableColumn } from '@astryxdesign/core/Table';
import {
  paginateData,
  pixel,
  proportional,
  Table,
  toSearchFilters,
  useTableFiltering,
  useTableFilterState,
  useTablePagination,
  useTableSortable,
  useTableSortableState,
} from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Label, SaveLabel } from '../../../core/taxonomy/taxonomy-contracts';
import { DetailSurface } from '../../design-system/DetailSurface';
import { useCatalog } from '../catalog/CatalogProvider';
import { useRecordDraft } from '../catalog/useRecordDraft';

const PAGE_SIZE = 25;

// Table's data-driven plugins require T extends Record<string, unknown>;
// Label is a plain named type with no index signature, so it needs this
// wrapper per Table's own documented pattern.
interface LabelRow extends Label, Record<string, unknown> {}

function draftOf(label?: Label): SaveLabel {
  return {
    id: label?.id ?? crypto.randomUUID(),
    expected_revision: label?.revision ?? null,
    name: label?.name ?? '',
    kind: label?.kind ?? 'tag',
    archived: label?.archived ?? false,
  };
}

export function LabelManager() {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const form = useRecordDraft(draftOf);
  const { value: draft, setValue: setDraft } = form;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const disabled = catalog.busy || !catalog.snapshot;
  const all = (catalog.snapshot?.labels ?? []) as LabelRow[];
  const searched = search
    ? all.filter((label) => label.name.toLowerCase().includes(search.toLowerCase()))
    : all;

  async function save() {
    const result = await catalog.mutate(() => window.reupmatic.catalogSaveLabel(draft));
    if (result) {
      form.replace(draftOf(result));
      setEditing(false);
    }
  }
  async function closeDetail() {
    if (await form.discard()) setEditing(false);
  }
  function openLabel(label?: Label) {
    setEditing(true);
    void form.choose(draftOf(label));
  }

  const kindFields = useMemo(
    () =>
      [
        {
          key: 'kind',
          type: 'enum',
          label: t('labelKind'),
          enumValues: ['tag', 'category', 'group'].map((value) => ({
            value,
            label: t(`labelKind_${value}`),
          })),
        },
      ] as const,
    [t],
  );
  const { config: filterConfig, applyFilters } = usePowerSearchConfig(kindFields);
  const { filters, onFilterChange } = useTableFilterState();
  const filterPlugin = useTableFiltering<LabelRow>({
    filters,
    onFilterChange,
    searchConfig: filterConfig,
  });

  // Not memoized: openLabel closes over per-render state, and re-deriving
  // three column defs each render is cheap.
  const columns: TableColumn<LabelRow>[] = [
    {
      key: 'name',
      header: t('catalogName'),
      width: proportional(2),
      sortable: true,
      renderCell: (label) => (
        <>
          <button type="button" className="business-row-open" onClick={() => openLabel(label)}>
            {label.name}
          </button>
          {label.archived && (
            <Text as="p" type="supporting">
              {t('catalogArchived')}
            </Text>
          )}
        </>
      ),
    },
    {
      key: 'kind',
      header: t('labelKind'),
      width: proportional(1),
      sortable: true,
      filter: 'kind',
      renderCell: (label) => t(`labelKind_${label.kind}`),
    },
    {
      key: 'actions',
      header: t('catalogActions'),
      width: pixel(140),
      resizable: false,
      renderCell: (label) => (
        <Button
          label={t('catalogEdit')}
          isDisabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            openLabel(label);
          }}
        />
      ),
    },
  ];

  const filtered = applyFilters(
    toSearchFilters(filters, columns, filterConfig) as PowerSearchFilter[],
    searched,
  );
  const { sortedData, sortConfig } = useTableSortableState<LabelRow>({
    data: filtered,
    defaultSort: [{ sortKey: 'name', direction: 'ascending' }],
  });
  const sortPlugin = useTableSortable<LabelRow>(sortConfig);
  const showPagination = sortedData.length > PAGE_SIZE;
  const paginationPlugin = useTablePagination<LabelRow>({
    page,
    onPageChange: setPage,
    totalItems: sortedData.length,
    pageSize: PAGE_SIZE,
    variant: 'count',
  });
  const pageData = showPagination ? paginateData(sortedData, page, PAGE_SIZE) : sortedData;

  return (
    <div className="taxonomy-workspace">
      <div className="business-grid">
        <div className="business-list">
          <Toolbar
            label={t('catalogLabels')}
            size="sm"
            startContent={
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
            }
            endContent={
              <div className="action-row">
                <Text type="supporting">{t('labelsCount', { count: sortedData.length })}</Text>
                <Button
                  label={t('labelCreate')}
                  variant="primary"
                  className="business-toolbar-primary"
                  tooltip={t('labelCreate')}
                  isDisabled={disabled}
                  onClick={() => openLabel()}
                />
              </div>
            }
          />
          {!all.length ? (
            <EmptyState title={t('labelsEmpty')} />
          ) : (
            <Table
              density="compact"
              aria-label={t('catalogLabels')}
              idKey="id"
              data={pageData}
              columns={columns}
              plugins={{
                sort: sortPlugin,
                filter: filterPlugin,
                ...(showPagination ? { pagination: paginationPlugin } : {}),
              }}
              emptyState={
                <EmptyState
                  title={t('labelsNoMatches')}
                  actions={<Button label={t('catalogClearSearch')} onClick={() => setSearch('')} />}
                />
              }
            />
          )}
        </div>
        <DetailSurface
          open={editing}
          label={t(draft.expected_revision ? 'labelEdit' : 'labelCreate')}
          onClose={() => void closeDetail()}
        >
          <div className="business-form">
            <TextInput
              label={t('catalogName')}
              value={draft.name}
              isDisabled={disabled}
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <Selector
              label={t('labelKind')}
              value={draft.kind}
              isDisabled={disabled || draft.expected_revision !== null}
              options={['tag', 'category', 'group'].map((value) => ({
                value,
                label: t(`labelKind_${value}`),
              }))}
              onChange={(kind) => setDraft({ ...draft, kind: kind as SaveLabel['kind'] })}
            />
            <CheckboxInput
              label={t('catalogArchive')}
              value={draft.archived}
              isDisabled={disabled}
              onChange={(archived) => setDraft({ ...draft, archived })}
            />
            <div className="action-row">
              <Button
                label={t('catalogSave')}
                variant="primary"
                isDisabled={
                  disabled || !draft.name.trim() || (!form.dirty && !!draft.expected_revision)
                }
                onClick={() => void save()}
              />
              <Button
                label={t('catalogReset')}
                isDisabled={disabled || !form.dirty}
                onClick={() => void form.reset()}
              />
              {form.dirty && <Text type="supporting">{t('catalogUnsaved')}</Text>}
            </div>
          </div>
        </DetailSurface>
      </div>
    </div>
  );
}
