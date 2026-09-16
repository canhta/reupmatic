import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Selector } from '@astryxdesign/core/Selector';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryLinkKind } from '../../../../core/library/library-types';
import { unwrap } from '../../../bridge/client';
import { libraryErrorKey } from '../i18n';
import { AssetPreview } from './AssetPreview';
import { useLibraryAssets } from './useLibraryAssets';

export interface AssetContent {
  id: string;
  name: string;
}
interface Props {
  content?: AssetContent;
  disabled: boolean;
  onFocus(content?: AssetContent): void;
  onOpen(itemId: string, projectId?: string): Promise<void>;
}
const kinds: LibraryLinkKind[] = ['project', 'export', 'subtitle', 'audio'];

export function LibraryAssetBrowser({ content, disabled, onFocus, onOpen }: Props) {
  const { t, i18n } = useTranslation();
  const assets = useLibraryAssets(content?.id);
  const [attachmentKind, setAttachmentKind] = useState<LibraryLinkKind>('audio');
  const { page, selected, busy, loading } = assets;
  const blocked = disabled || busy;
  const options = kinds.map((value) => ({ value, label: t(`libraryLink_${value}`) }));
  return (
    <div className="library-assets" aria-busy={loading || busy}>
      <p>{t('assetIntro')}</p>
      {content && (
        <div className="action-row">
          <h2>{content.name}</h2>
          <Button label={t('assetAllContent')} isDisabled={blocked} onClick={() => onFocus()} />
        </div>
      )}
      <div className="library-toolbar">
        <Selector
          label={t('assetKind')}
          value={assets.kind}
          isDisabled={blocked}
          options={[{ value: 'all', label: t('assetAllKinds') }, ...options]}
          onChange={(value) => assets.changeKind(value as LibraryLinkKind | 'all')}
        />
        <TextInput
          label={t('assetSearch')}
          value={assets.search}
          isDisabled={blocked}
          onChange={assets.changeSearch}
        />
        <Button
          label={t('libraryRefresh')}
          isDisabled={blocked || loading}
          onClick={() => void assets.action(assets.reload)}
        />
      </div>
      {content ? (
        <Collapsible trigger={t('assetAttachTitle')} defaultIsOpen={false}>
          <p className="field-help">{t('assetAttachHelp')}</p>
          <div className="library-toolbar">
            <Selector
              label={t('assetKind')}
              value={attachmentKind}
              options={options}
              isDisabled={blocked}
              onChange={(value) => setAttachmentKind(value as LibraryLinkKind)}
            />
            <Button
              label={t('assetAttach')}
              isDisabled={blocked}
              onClick={() => void assets.action(() => assets.attach(attachmentKind))}
            />
          </div>
        </Collapsible>
      ) : (
        <p className="field-help">{t('assetAttachFromContent')}</p>
      )}
      {assets.error && (
        <Banner
          status="error"
          title={t(libraryErrorKey(assets.error))}
          description={<code>{assets.error}</code>}
        />
      )}
      {loading && <p role="status">{t('libraryLoading')}</p>}
      {!loading && page?.items.length === 0 && (
        <EmptyState title={t('assetEmpty')} description={t('assetEmptyHelp')} />
      )}
      {page && page.items.length > 0 && (
        <>
          <div className="library-table-scroll">
            <Table density="compact" aria-label={t('assetTab')}>
              <TableHeader>
                <TableRow isHeaderRow>
                  <TableHeaderCell scope="col">{t('assetFile')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('assetKind')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('assetContent')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('assetRecorded')}</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell>
                      <Button
                        label={asset.name}
                        variant={selected?.id === asset.id ? 'primary' : 'ghost'}
                        isDisabled={blocked || loading}
                        aria-current={selected?.id === asset.id ? 'true' : undefined}
                        onClick={() => assets.select(asset)}
                      />
                    </TableCell>
                    <TableCell>{t(`libraryLink_${asset.kind}`)}</TableCell>
                    <TableCell>{asset.content_name}</TableCell>
                    <TableCell>
                      {new Date(asset.created_at).toLocaleString(i18n.language)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="action-row library-pagination">
            <span>
              {t('libraryPage', {
                from: page.offset + 1,
                to: page.offset + page.items.length,
                total: page.total,
              })}
            </span>
            <Button
              label={t('libraryPrevious')}
              isDisabled={blocked || loading || page.offset === 0}
              onClick={() => assets.changePage(page.offset - page.limit)}
            />
            <Button
              label={t('libraryNext')}
              isDisabled={blocked || loading || page.offset + page.limit >= page.total}
              onClick={() => assets.changePage(page.offset + page.limit)}
            />
          </div>
        </>
      )}
      {selected && (
        <section aria-label={t('assetDetails')}>
          <h2>{selected.name}</h2>
          <MetadataList label={{ position: 'top' }}>
            <MetadataListItem label={t('librarySourcePath')}>
              <span className="library-path">{selected.path}</span>
            </MetadataListItem>
            <MetadataListItem label={t('assetBytes')}>
              {selected.size_bytes.toLocaleString(i18n.language)}
            </MetadataListItem>
            <MetadataListItem label={t('libraryStatus')}>
              {t(`assetStatus_${assets.availability}`)}
            </MetadataListItem>
          </MetadataList>
          <p className="field-help">{t('assetIdentityHelp')}</p>
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
            {!content && (
              <Button
                label={t('assetContentFiles')}
                isDisabled={blocked}
                onClick={() => onFocus({ id: selected.item_id, name: selected.content_name })}
              />
            )}
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
