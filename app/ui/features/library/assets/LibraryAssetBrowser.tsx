import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Selector } from '@astryxdesign/core/Selector';
import type { TableColumn } from '@astryxdesign/core/Table';
import {
  proportional,
  Table,
  useTablePagination,
  useTableSortable,
} from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ContentAssetKind,
  ContentAssetSortKey,
  ContentAssetView,
} from '../../../../core/library/library-contracts';
import { unwrap } from '../../../bridge/client';
import { libraryErrorKey } from '../error-message';
import { AssetPreview } from './AssetPreview';
import { useLibraryAssets } from './useLibraryAssets';

interface AssetRow extends ContentAssetView, Record<string, unknown> {}

interface Props {
  contentId: string;
  disabled: boolean;
  onOpen(itemId: string, projectId?: string): Promise<void>;
}
const kinds: ContentAssetKind[] = ['project', 'export', 'subtitle', 'audio'];

export function LibraryAssetBrowser({ contentId, disabled, onOpen }: Props) {
  const { t, i18n } = useTranslation();
  const assets = useLibraryAssets(contentId);
  const [attachmentKind, setAttachmentKind] = useState<ContentAssetKind>('audio');
  const { page, selected, busy, loading, sort } = assets;
  const blocked = disabled || busy;
  const options = kinds.map((value) => ({ value, label: t(`libraryLink_${value}`) }));
  const filtersActive = assets.kind !== 'all' || !!assets.search;

  const columns: TableColumn<AssetRow>[] = [
    {
      key: 'name',
      header: t('assetFile'),
      width: proportional(2),
      sortable: true,
      renderCell: (asset) => (
        <Button
          label={asset.name}
          variant={selected?.id === asset.id ? 'primary' : 'ghost'}
          isDisabled={blocked || loading}
          aria-current={selected?.id === asset.id ? 'true' : undefined}
          onClick={() => assets.select(asset)}
        />
      ),
    },
    {
      key: 'kind',
      header: t('assetKind'),
      width: proportional(1),
      sortable: true,
      renderCell: (asset) => t(`libraryLink_${asset.kind}`),
    },
    {
      key: 'created_at',
      header: t('assetRecorded'),
      width: proportional(1),
      sortable: true,
      renderCell: (asset) => new Date(asset.created_at).toLocaleString(i18n.language),
    },
  ];
  const sortPlugin = useTableSortable<AssetRow, ContentAssetSortKey>({
    sort,
    onSortChange: assets.changeSort,
  });
  const showPagination = (page?.total ?? 0) > (page?.limit ?? 20);
  const paginationPlugin = useTablePagination<AssetRow>({
    page: page ? Math.floor(page.offset / page.limit) + 1 : 1,
    onPageChange: (next) => assets.changePage((next - 1) * (page?.limit ?? 20)),
    totalItems: page?.total ?? 0,
    pageSize: page?.limit ?? 20,
    variant: 'count',
  });

  return (
    <div className="library-assets" aria-busy={loading || busy}>
      <Toolbar
        label={t('assetTab')}
        size="sm"
        startContent={
          <TextInput
            label={t('assetSearch')}
            isLabelHidden
            placeholder={t('assetSearch')}
            startIcon="search"
            hasClear
            value={assets.search}
            isDisabled={blocked}
            onChange={assets.changeSearch}
          />
        }
        endContent={
          <div className="action-row">
            <Selector
              label={t('assetKind')}
              isLabelHidden
              value={assets.kind}
              isDisabled={blocked}
              options={[{ value: 'all', label: t('assetAllKinds') }, ...options]}
              onChange={(value) => assets.changeKind(value as ContentAssetKind | 'all')}
            />
            <Text type="supporting">{t('assetCount', { count: page?.total ?? 0 })}</Text>
            <Button
              label={t('libraryRefresh')}
              isDisabled={blocked || loading}
              onClick={() => void assets.action(assets.reload)}
            />
          </div>
        }
      />
      <Collapsible trigger={t('assetAttachTitle')} defaultIsOpen={false}>
        <Text as="p" type="supporting">
          {t('assetAttachHelp')}
        </Text>
        <div className="library-toolbar">
          <Selector
            label={t('assetKind')}
            value={attachmentKind}
            options={options}
            isDisabled={blocked}
            onChange={(value) => setAttachmentKind(value as ContentAssetKind)}
          />
          <Button
            label={t('assetAttach')}
            isDisabled={blocked}
            onClick={() => void assets.action(() => assets.attach(attachmentKind))}
          />
        </div>
      </Collapsible>
      {assets.error && (
        <Banner
          status="error"
          title={t(libraryErrorKey(assets.error))}
          description={<code>{assets.error}</code>}
        />
      )}
      {loading && (
        <Text as="p" type="body" role="status">
          {t('libraryLoading')}
        </Text>
      )}
      {!loading && page?.items.length === 0 && !filtersActive && (
        <EmptyState title={t('assetEmpty')} description={t('assetEmptyHelp')} />
      )}
      {!loading && page?.items.length === 0 && filtersActive && (
        <EmptyState
          title={t('assetNoMatches')}
          actions={
            <Button
              label={t('catalogClearSearch')}
              onClick={() => {
                assets.changeSearch('');
                assets.changeKind('all');
              }}
            />
          }
        />
      )}
      {page && page.items.length > 0 && (
        <div className="library-table-scroll">
          <Table
            density="compact"
            aria-label={t('assetTab')}
            idKey="id"
            data={page.items as AssetRow[]}
            columns={columns}
            plugins={{
              sort: sortPlugin,
              ...(showPagination ? { pagination: paginationPlugin } : {}),
            }}
          />
        </div>
      )}
      {selected && (
        <section aria-label={t('assetDetails')}>
          <Heading level={5}>{selected.name}</Heading>
          <MetadataList label={{ position: 'top' }}>
            <MetadataListItem label={t('librarySourcePath')}>
              <Text type="body" className="library-path">
                {selected.path}
              </Text>
            </MetadataListItem>
            <MetadataListItem label={t('assetBytes')}>
              {selected.size_bytes.toLocaleString(i18n.language)}
            </MetadataListItem>
            <MetadataListItem label={t('libraryStatus')}>
              {t(`assetStatus_${assets.availability}`)}
            </MetadataListItem>
          </MetadataList>
          <Text as="p" type="supporting">
            {t('assetIdentityHelp')}
          </Text>
          <div className="action-row">
            <Button
              label={t(selected.kind === 'project' ? 'openProject' : 'assetPreview')}
              isDisabled={blocked}
              onClick={() =>
                void assets.action(() =>
                  selected.kind === 'project'
                    ? onOpen(selected.item_id, selected.id)
                    : assets.inspect(selected, true),
                )
              }
            />
            <Button
              label={t('assetCheck')}
              isDisabled={blocked}
              onClick={() => void assets.action(() => assets.inspect(selected, false))}
            />
            <Button
              label={t('libraryReveal')}
              isDisabled={blocked}
              onClick={() =>
                void assets.action(async () => {
                  await unwrap(window.reupmatic.libraryReveal(selected.item_id, selected.id));
                })
              }
            />
          </div>
          <Collapsible trigger={t('libraryHash')} defaultIsOpen={false}>
            <code>{selected.sha256}</code>
          </Collapsible>
          {assets.availability === 'changed' && (
            <Banner status="warning" title={t('assetChanged')} />
          )}
          {assets.availability === 'missing' && (
            <Banner status="warning" title={t('assetMissing')} />
          )}
          {assets.preview && <AssetPreview key={selected.id} value={assets.preview} />}
        </section>
      )}
    </div>
  );
}
