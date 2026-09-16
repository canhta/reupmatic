import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Page } from '../../../core/catalog/catalog-types';
import type { Post, PostQuery } from '../../../core/distribution/distribution-types';
import { unwrap } from '../../bridge/client';
import { useCatalog } from '../catalog/CatalogProvider';
import { useRecordDraft } from '../catalog/useRecordDraft';
import { PostEditor } from './PostEditor';
import { postDraft } from './post-draft';

export type PostFilter = Pick<PostQuery, 'channel_id' | 'link_id' | 'view'>;
export function PostBrowser({
  filter,
  onFilter,
}: {
  filter: PostFilter;
  onFilter(filter: PostFilter): void;
}) {
  const { t, i18n } = useTranslation();
  const catalog = useCatalog();
  const form = useRecordDraft(postDraft);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page<Post> | null>(null);
  const [error, setError] = useState(false);
  const [_generation, setGeneration] = useState(0);
  const _revision = catalog.snapshot?.revision;
  useEffect(() => {
    let alive = true;
    setError(false);
    setPage(null);
    void unwrap(window.reupmatic.postList({ ...filter, search, offset, limit: 25 }))
      .then((value) => {
        if (!alive) return;
        if (offset && offset >= value.total) {
          setOffset(0);
          return;
        }
        setPage(value);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [filter, search, offset]);
  useEffect(() => setOffset(0), []);
  const filtered = !!filter.channel_id || !!filter.link_id;
  const filterName = filter.channel_id
    ? catalog.snapshot?.channels.find((item) => item.id === filter.channel_id)?.name
    : catalog.snapshot?.links.find((item) => item.id === filter.link_id)?.name;

  return (
    <div className="business-workspace">
      <Banner status="info" title={t('postsLocalTitle')} description={t('postsLocalHelp')} />
      <div className="business-grid">
        <div className="business-list">
          <div className="business-toolbar">
            <TextInput
              label={t('catalogSearch')}
              value={search}
              onChange={(value) => {
                setSearch(value);
                setOffset(0);
              }}
            />
            <Selector
              label={t('postView')}
              value={filter.view}
              options={['all', 'upcoming', 'published', 'cancelled'].map((value) => ({
                value,
                label: t(`postView_${value}`),
              }))}
              onChange={(view) => onFilter({ ...filter, view: view as PostQuery['view'] })}
            />
            <Button
              label={t('postNew')}
              isDisabled={catalog.busy || !catalog.snapshot}
              onClick={() => void form.choose(postDraft())}
            />
          </div>
          {filtered && (
            <div className="action-row">
              <span>
                {t('postFilter', { name: filterName ?? filter.channel_id ?? filter.link_id })}
              </span>
              <Button
                label={t('postClearFilter')}
                onClick={() => onFilter({ view: filter.view })}
              />
            </div>
          )}
          {error ? (
            <Banner
              status="error"
              title={t('postsLoadError')}
              endContent={
                <Button
                  label={t('retryLoad')}
                  onClick={() => setGeneration((value) => value + 1)}
                />
              }
            />
          ) : !page ? (
            <p role="status">{t('catalogLoading')}</p>
          ) : !page.items.length ? (
            <EmptyState
              title={t(filter.view === 'published' ? 'postsPublishedEmpty' : 'postsEmpty')}
              description={t(filter.view === 'published' ? 'postsPublishedHelp' : 'postsEmptyHelp')}
            />
          ) : (
            <Table density="compact" aria-label={t('postsTab')}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell scope="col">{t('postTitle')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('postDestination')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('postState')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('postPlanTime')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('catalogActions')}</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>{post.title}</TableCell>
                    <TableCell>{post.channel.name}</TableCell>
                    <TableCell>{t(`postState_${post.state}`)}</TableCell>
                    <TableCell>
                      {post.planned
                        ? `${new Date(post.planned.instant).toLocaleString(i18n.language, {
                            timeZone: post.planned.timezone,
                          })} (${post.planned.timezone})`
                        : t('postUnplanned')}
                    </TableCell>
                    <TableCell>
                      <Button
                        label={t('catalogEdit')}
                        isDisabled={catalog.busy}
                        onClick={() => void form.choose(postDraft(post))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {page && (
            <div className="business-pagination">
              <span>{t('catalogCount', { count: page.total })}</span>
              <Button
                label={t('libraryPrevious')}
                isDisabled={!offset}
                onClick={() => setOffset(Math.max(0, offset - 25))}
              />
              <Button
                label={t('libraryNext')}
                isDisabled={offset + 25 >= page.total}
                onClick={() => setOffset(offset + 25)}
              />
            </div>
          )}
        </div>
        <PostEditor form={form} onSaved={() => setGeneration((value) => value + 1)} />
      </div>
    </div>
  );
}
