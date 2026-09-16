import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { FormLayout } from '@astryxdesign/core/FormLayout';
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
import type { AffiliateLink, SaveAffiliate } from '../../../core/distribution/distribution-types';
import { useCatalog } from '../catalog/CatalogProvider';
import { useRecordDraft } from '../catalog/useRecordDraft';
import { LabelPicker } from '../taxonomy/LabelPicker';

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
  const [page, setPage] = useState(0);
  const disabled = catalog.busy || !catalog.snapshot;
  const rows = (catalog.snapshot?.links ?? []).filter((link) =>
    `${link.name} ${link.url}`.toLowerCase().includes(search.toLowerCase()),
  );
  const offset = Math.min(page * 25, Math.max(0, Math.ceil(rows.length / 25) - 1) * 25);
  async function save() {
    const result = await catalog.mutate(() => window.reupmatic.affiliateSave(draft));
    if (result) replace(draftOf(result));
  }
  return (
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
            label={t('affiliateNew')}
            isDisabled={disabled}
            onClick={() => void form.choose(draftOf())}
          />
        </div>
        <p>{t('affiliateUsageHelp')}</p>
        {!rows.length ? (
          <EmptyState title={t('affiliateEmpty')} description={t('affiliateEmptyHelp')} />
        ) : (
          <Table density="compact" aria-label={t('affiliateTab')}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell scope="col">{t('catalogName')}</TableHeaderCell>
                <TableHeaderCell scope="col">{t('affiliateUsage')}</TableHeaderCell>
                <TableHeaderCell scope="col">{t('catalogActions')}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(offset, offset + 25).map((link) => (
                <TableRow key={link.id}>
                  <TableCell>
                    {link.name}
                    {link.archived && <p>{t('catalogArchived')}</p>}
                  </TableCell>
                  <TableCell>{catalog.snapshot?.link_usage[link.id] ?? 0}</TableCell>
                  <TableCell>
                    <div className="action-row">
                      <Button
                        label={t('catalogEdit')}
                        isDisabled={disabled}
                        onClick={() => void form.choose(draftOf(link))}
                      />
                      <Button label={t('affiliateViewUsage')} onClick={() => onPosts(link.id)} />
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
        <h2>{t(draft.expected_revision ? 'affiliateEdit' : 'affiliateNew')}</h2>
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
        <p className="field-help">{t('affiliateUrlHelp')}</p>
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
        <p className="field-help">{t('affiliateSnapshotHelp')}</p>
        <div className="action-row">
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
          {dirty && <span>{t('catalogUnsaved')}</span>}
        </div>
      </div>
    </div>
  );
}
