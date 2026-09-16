import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
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
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Label, SaveLabel } from '../../../core/taxonomy/taxonomy-types';
import { useCatalog } from '../catalog/CatalogProvider';
import { useRecordDraft } from '../catalog/useRecordDraft';

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
  const [page, setPage] = useState(0);
  const rows = (catalog.snapshot?.labels ?? []).filter((label) =>
    label.name.toLowerCase().includes(search.toLowerCase()),
  );
  const offset = Math.min(page * 25, Math.max(0, Math.ceil(rows.length / 25) - 1) * 25);
  const disabled = catalog.busy || !catalog.snapshot;
  async function save() {
    const result = await catalog.mutate(() => window.reupmatic.catalogSaveLabel(draft));
    if (result) form.replace(draftOf(result));
  }
  return (
    <div className="business-workspace">
      <p>{t('labelsSharedHelp')}</p>
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
              label={t('labelCreate')}
              isDisabled={disabled}
              onClick={() => void form.choose(draftOf())}
            />
          </div>
          {!rows.length ? (
            <EmptyState title={t('labelsEmpty')} description={t('labelsEmptyHelp')} />
          ) : (
            <Table density="compact" aria-label={t('catalogLabels')}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell scope="col">{t('catalogName')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('labelKind')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('catalogActions')}</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(offset, offset + 25).map((label) => (
                  <TableRow key={label.id}>
                    <TableCell>
                      {label.name}
                      {label.archived && <p>{t('catalogArchived')}</p>}
                    </TableCell>
                    <TableCell>{t(`labelKind_${label.kind}`)}</TableCell>
                    <TableCell>
                      <Button
                        label={t('catalogEdit')}
                        isDisabled={disabled}
                        onClick={() => void form.choose(draftOf(label))}
                      />
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
              isDisabled={!offset}
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
          <h2>{t(draft.expected_revision ? 'labelEdit' : 'labelCreate')}</h2>
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
          <p className="field-help">{t('labelArchiveHelp')}</p>
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
            {form.dirty && <span>{t('catalogUnsaved')}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
