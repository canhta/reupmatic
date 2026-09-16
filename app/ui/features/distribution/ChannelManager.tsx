import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { FormLayout } from '@astryxdesign/core/FormLayout';
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
import type {
  Channel,
  Platform,
  PostQuery,
  SaveChannel,
} from '../../../core/distribution/distribution-types';
import { useCatalog } from '../catalog/CatalogProvider';
import { useRecordDraft } from '../catalog/useRecordDraft';
import { LabelPicker } from '../taxonomy/LabelPicker';

function draftOf(record?: Channel): SaveChannel {
  return {
    id: record?.id ?? crypto.randomUUID(),
    expected_revision: record?.revision ?? null,
    name: record?.name ?? '',
    platform: record?.platform ?? 'youtube',
    url: record?.url ?? '',
    label_ids: record?.label_ids ?? [],
    archived: record?.archived ?? false,
  };
}

export function ChannelManager({
  onPosts,
}: {
  onPosts(id: string, view: PostQuery['view']): void;
}) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const form = useRecordDraft(draftOf);
  const { value: draft, setValue: setDraft, dirty, replace } = form;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const disabled = catalog.busy || !catalog.snapshot;
  const rows = (catalog.snapshot?.channels ?? []).filter((channel) =>
    channel.name.toLowerCase().includes(search.toLowerCase()),
  );
  const offset = Math.min(page * 25, Math.max(0, Math.ceil(rows.length / 25) - 1) * 25);
  async function save() {
    const saved = await catalog.mutate(() => window.reupmatic.channelSave(draft));
    if (saved) replace(draftOf(saved));
  }
  return (
    <div className="business-workspace">
      <Banner status="info" title={t('channelsLocalTitle')} description={t('channelsLocalHelp')} />
      <div className="business-grid">
        <div className="business-list">
          <div className="business-toolbar">
            <TextInput
              label={t('catalogSearch')}
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(0);
              }}
            />
            <Button
              label={t('channelNew')}
              isDisabled={disabled}
              onClick={() => void form.choose(draftOf())}
            />
          </div>
          {!rows.length ? (
            <EmptyState title={t('channelsEmpty')} description={t('channelsEmptyHelp')} />
          ) : (
            <Table density="compact" aria-label={t('channelsTab')}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell scope="col">{t('catalogName')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('channelPlatform')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('catalogActions')}</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(offset, offset + 25).map((channel) => (
                  <TableRow key={channel.id}>
                    <TableCell>
                      {channel.name}
                      {channel.archived && <p>{t('catalogArchived')}</p>}
                    </TableCell>
                    <TableCell>{t(`platform_${channel.platform}`)}</TableCell>
                    <TableCell>
                      <div className="action-row">
                        <Button
                          label={t('catalogEdit')}
                          isDisabled={disabled}
                          onClick={() => void form.choose(draftOf(channel))}
                        />
                        <Button
                          label={t('channelPosts')}
                          onClick={() => onPosts(channel.id, 'all')}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="business-pagination">
            <span>{t('catalogCount', { count: rows.length })}</span>
            <Button
              label={t('libraryPrevious')}
              isDisabled={offset === 0}
              onClick={() => setPage(Math.max(0, page - 1))}
            />
            <Button
              label={t('libraryNext')}
              isDisabled={offset + 25 >= rows.length}
              onClick={() => setPage(page + 1)}
            />
          </div>
        </div>
        <div className="business-form">
          <h2>{t(draft.expected_revision ? 'channelEdit' : 'channelNew')}</h2>
          {draft.expected_revision !== null && (
            <div className="action-row">
              <Button
                label={t('postView_upcoming')}
                onClick={() => onPosts(draft.id, 'upcoming')}
              />
              <Button
                label={t('postView_published')}
                onClick={() => onPosts(draft.id, 'published')}
              />
            </div>
          )}
          <FormLayout>
            <TextInput
              label={t('catalogName')}
              value={draft.name}
              isDisabled={disabled}
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <Selector
              label={t('channelPlatform')}
              value={draft.platform}
              isDisabled={disabled || draft.expected_revision !== null}
              options={['youtube', 'facebook_page'].map((value) => ({
                value,
                label: t(`platform_${value}`),
              }))}
              onChange={(platform) => setDraft({ ...draft, platform: platform as Platform })}
            />
            <TextInput
              label={t('channelUrl')}
              value={draft.url}
              isDisabled={disabled}
              onChange={(url) => setDraft({ ...draft, url })}
            />
          </FormLayout>
          <LabelPicker
            value={draft.label_ids}
            onChange={(label_ids) => setDraft({ ...draft, label_ids })}
            disabled={disabled}
          />
          <CheckboxInput
            label={t('catalogArchive')}
            value={draft.archived}
            isDisabled={disabled}
            onChange={(archived) => setDraft({ ...draft, archived })}
          />
          <p className="field-help">{t('channelArchiveHelp')}</p>
          <div className="action-row">
            <Button
              label={t('catalogSave')}
              variant="primary"
              isDisabled={
                disabled || !draft.name.trim() || (!dirty && draft.expected_revision !== null)
              }
              onClick={() => void save()}
            />
            <Button
              label={t('catalogReset')}
              isDisabled={disabled || !dirty}
              onClick={() => void form.reset()}
            />
            {dirty && <span>{t('catalogUnsaved')}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
