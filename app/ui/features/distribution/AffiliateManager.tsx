import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { HStack } from '@astryxdesign/core/HStack';
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
import { TextInput } from '@astryxdesign/core/TextInput';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AffiliateLink,
  SaveAffiliate,
} from '../../../core/distribution/distribution-contracts';
import { DetailSurface } from '../../design-system/DetailSurface';
import { useCatalog } from '../catalog/CatalogProvider';
import { useRecordDraft } from '../catalog/useRecordDraft';
import { LabelPicker } from '../taxonomy/LabelPicker';

const PAGE_SIZE = 25;

interface AffiliateRow extends AffiliateLink, Record<string, unknown> {
  usage: number;
}

function draftOf(record?: AffiliateLink): SaveAffiliate {
  return {
    id: record?.id ?? crypto.randomUUID(),
    expected_revision: record?.revision ?? null,
    name: record?.name ?? '',
    url: record?.url ?? '',
    label_ids: record?.label_ids ?? [],
    archived: record?.archived ?? false,
  };
}

export function AffiliateManager({ onPosts }: { onPosts(id: string): void }) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const form = useRecordDraft(draftOf);
  const { value: draft, setValue: setDraft, dirty, replace } = form;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const disabled = catalog.busy || !catalog.snapshot;
  const usage = catalog.snapshot?.link_usage ?? {};
  const all: AffiliateRow[] = (catalog.snapshot?.links ?? []).map((link) => ({
    ...link,
    usage: usage[link.id] ?? 0,
  }));
  const searched = search
    ? all.filter((link) => `${link.name} ${link.url}`.toLowerCase().includes(search.toLowerCase()))
    : all;

  async function save() {
    const result = await catalog.mutate(() => window.reupmatic.affiliateSave(draft));
    if (result) {
      replace(draftOf(result));
      setEditing(false);
    }
  }
  async function closeDetail() {
    if (await form.discard()) setEditing(false);
  }
  function openLink(link: AffiliateLink) {
    setEditing(true);
    void form.choose(draftOf(link));
  }

  const columns: TableColumn<AffiliateRow>[] = [
    {
      key: 'name',
      header: t('catalogName'),
      width: proportional(2),
      sortable: true,
      renderCell: (link) => (
        <>
          <button type="button" className="business-row-open" onClick={() => openLink(link)}>
            {link.name}
          </button>
          {link.archived && (
            <Text as="p" type="supporting">
              {t('catalogArchived')}
            </Text>
          )}
        </>
      ),
    },
    {
      key: 'usage',
      header: t('affiliateUsage'),
      width: proportional(1),
      sortable: true,
      align: 'end',
    },
    {
      key: 'actions',
      header: t('catalogActions'),
      width: pixel(160),
      resizable: false,
      renderCell: (link) => (
        <Button
          label={t('affiliateViewUsage')}
          onClick={(event) => {
            event.stopPropagation();
            onPosts(link.id);
          }}
        />
      ),
    },
  ];

  const { sortedData, sortConfig } = useTableSortableState<AffiliateRow>({
    data: searched,
    defaultSort: [{ sortKey: 'name', direction: 'ascending' }],
  });
  const sortPlugin = useTableSortable<AffiliateRow>(sortConfig);
  const showPagination = sortedData.length > PAGE_SIZE;
  const paginationPlugin = useTablePagination<AffiliateRow>({
    page,
    onPageChange: setPage,
    totalItems: sortedData.length,
    pageSize: PAGE_SIZE,
    variant: 'count',
  });
  const pageData = showPagination ? paginateData(sortedData, page, PAGE_SIZE) : sortedData;

  return (
    <div className="business-grid">
      <div className="business-list">
        <Toolbar
          label={t('affiliateTab')}
          size="sm"
          startContent={
            <TextInput
              label={t('catalogSearch')}
              isLabelHidden
              placeholder={t('affiliateSearchPlaceholder')}
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
            <HStack gap={2} vAlign="center" wrap="wrap" hAlign="between">
              <Text type="supporting">
                {t('affiliateLinksCount', { count: sortedData.length })}
              </Text>
              <Button
                label={t('affiliateNew')}
                variant="primary"
                tooltip={t('affiliateNew')}
                isDisabled={disabled}
                onClick={() => {
                  setEditing(true);
                  void form.choose(draftOf());
                }}
              />
            </HStack>
          }
        />
        {!all.length ? (
          <EmptyState title={t('affiliateEmpty')} />
        ) : (
          <Table
            density="compact"
            aria-label={t('affiliateTab')}
            idKey="id"
            data={pageData}
            columns={columns}
            plugins={{
              sort: sortPlugin,
              ...(showPagination ? { pagination: paginationPlugin } : {}),
            }}
            emptyState={
              <EmptyState
                title={t('affiliateNoMatches')}
                actions={<Button label={t('catalogClearSearch')} onClick={() => setSearch('')} />}
              />
            }
          />
        )}
      </div>
      <DetailSurface
        open={editing}
        label={t(draft.expected_revision ? 'affiliateEdit' : 'affiliateNew')}
        onClose={() => void closeDetail()}
      >
        <VStack gap={3}>
          <FormLayout>
            <TextInput
              label={t('catalogName')}
              value={draft.name}
              isDisabled={disabled}
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <TextInput
              label={t('affiliateUrl')}
              value={draft.url}
              isDisabled={disabled}
              onChange={(url) => setDraft({ ...draft, url })}
            />
          </FormLayout>
          <Text as="p" type="supporting">
            {t('affiliateUrlHelp')}
          </Text>
          <LabelPicker
            value={draft.label_ids}
            disabled={disabled}
            onChange={(label_ids) => setDraft({ ...draft, label_ids })}
          />
          <CheckboxInput
            label={t('catalogArchive')}
            value={draft.archived}
            isDisabled={disabled}
            onChange={(archived) => setDraft({ ...draft, archived })}
          />
          <Text as="p" type="supporting">
            {t('affiliateSnapshotHelp')}
          </Text>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Button
              label={t('catalogSave')}
              variant="primary"
              isDisabled={
                disabled ||
                !draft.name.trim() ||
                !draft.url ||
                (!dirty && draft.expected_revision !== null)
              }
              onClick={() => void save()}
            />
            <Button
              label={t('catalogReset')}
              isDisabled={disabled || !dirty}
              onClick={() => void form.reset()}
            />
            {dirty && <Text type="supporting">{t('catalogUnsaved')}</Text>}
          </HStack>
        </VStack>
      </DetailSurface>
    </div>
  );
}
