import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { List, ListItem } from '@astryxdesign/core/List';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { Pagination } from '@astryxdesign/core/Pagination';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import type { ContentAssetKind, ContentEntry } from '../../../../core/library/library-contracts';
import { unwrap } from '../../../bridge/client';
import { PanelRows, PanelSection, PanelStatus, ValueRow } from '../../../design-system/Panel';
import { libraryErrorKey } from '../error-message';
import { AssetPreview } from './AssetPreview';
import { useLibraryAssets } from './useLibraryAssets';

interface Props {
  item: ContentEntry;
  disabled: boolean;
  onOpen(itemId: string, projectId?: string): Promise<void>;
}
const kinds: ContentAssetKind[] = ['project', 'export', 'subtitle', 'audio'];
// Below this many assets a search box is noise.
const SEARCH_FROM = 6;

export function LibraryAssetBrowser({ item, disabled, onOpen }: Props) {
  const { t, i18n } = useTranslation();
  const assets = useLibraryAssets(item);
  const { page, selected, busy, loading } = assets;
  const blocked = disabled || busy;
  const total = page?.total ?? 0;
  const limit = page?.limit ?? 20;

  return (
    <PanelSection
      title={t('assetRelated')}
      status={assets.error ? { tone: 'error', text: t(libraryErrorKey(assets.error)) } : null}
      actions={
        <DropdownMenu
          button={{ label: t('assetAttach'), size: 'sm', isDisabled: blocked }}
          alignment="end"
          items={kinds.map((kind) => ({
            label: t(`libraryLink_${kind}`),
            onClick: () => void assets.action(() => assets.attach(kind)),
          }))}
        />
      }
    >
      <VStack gap={3} aria-busy={loading || busy}>
        {(total >= SEARCH_FROM || assets.search) && (
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
        )}
        {loading && (
          <Text as="p" type="body" role="status">
            {t('libraryLoading')}
          </Text>
        )}
        {!loading && page?.items.length === 0 && (
          <Text as="p" type="supporting">
            {assets.search ? t('assetNoMatches') : t('assetEmptyHelp')}
          </Text>
        )}
        {page && page.items.length > 0 && (
          <List density="compact" hasDividers>
            {page.items.map((asset) => (
              <ListItem
                key={asset.id}
                label={asset.name}
                description={`${t(`libraryLink_${asset.kind}`)} · ${new Date(asset.created_at).toLocaleDateString(i18n.language)}`}
                isSelected={selected?.id === asset.id}
                isDisabled={blocked || loading}
                onClick={() => assets.select(asset)}
                endContent={
                  <MoreMenu
                    label={t('libraryMoreActions')}
                    size="sm"
                    alignment="end"
                    isDisabled={blocked}
                    items={[
                      {
                        label: t(asset.kind === 'project' ? 'openProject' : 'assetPreview'),
                        onClick: () => {
                          assets.select(asset);
                          void assets.action(() =>
                            asset.kind === 'project'
                              ? onOpen(asset.item_id, asset.id)
                              : assets.inspect(asset, true),
                          );
                        },
                      },
                      {
                        label: t('assetCheck'),
                        onClick: () => {
                          assets.select(asset);
                          void assets.action(() => assets.inspect(asset, false));
                        },
                      },
                      {
                        label: t('libraryReveal'),
                        onClick: () =>
                          void assets.action(async () => {
                            await unwrap(window.reupmatic.libraryReveal(asset.item_id, asset.id));
                          }),
                      },
                    ]}
                  />
                }
              />
            ))}
          </List>
        )}
        {total > limit && page && (
          <Pagination
            page={Math.floor(page.offset / limit) + 1}
            totalItems={total}
            pageSize={limit}
            onChange={(next) => assets.changePage((next - 1) * limit)}
          />
        )}
        {selected && (
          <VStack gap={3} aria-label={t('assetDetails')}>
            <PanelRows>
              <ValueRow label={t('librarySourcePath')}>{selected.path}</ValueRow>
              <ValueRow label={t('assetBytes')}>
                {selected.size_bytes.toLocaleString(i18n.language)}
              </ValueRow>
              <ValueRow label={t('libraryStatus')}>
                {assets.availability === 'changed' || assets.availability === 'missing' ? (
                  <PanelStatus tone="warning" text={t(`assetStatus_${assets.availability}`)} />
                ) : (
                  t(`assetStatus_${assets.availability}`)
                )}
              </ValueRow>
            </PanelRows>
            {assets.preview && <AssetPreview key={selected.id} value={assets.preview} />}
          </VStack>
        )}
      </VStack>
    </PanelSection>
  );
}
