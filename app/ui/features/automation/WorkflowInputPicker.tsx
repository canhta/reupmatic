import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryPage } from '../../../core/library/library-types';
import { unwrap } from '../../bridge/client';

export function WorkflowInputPicker({ value, onChange, disabled }: {
  value: string[]; onChange(ids: string[]): void; disabled: boolean;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<LibraryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration(current => current + 1), []);

  useEffect(() => window.reupmatic.onLibraryChanged(refresh), [refresh]);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    void unwrap(window.reupmatic.libraryList({ search, offset, limit: 25 })).then(result => {
      if (current) setPage(result);
    }).catch(reason => {
      if (current) setError(reason instanceof Error ? reason.message : 'LIBRARY_UNAVAILABLE');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [search, offset, generation]);

  return <div className="business-form">
    <h3>{t('workflowInputs')}</h3>
    <TextInput label={t('librarySearch')} value={search} isDisabled={disabled}
      onChange={text => { setSearch(text); setOffset(0); }} />
    <p role="status">{t('workflowSelection', { count: value.length })}</p>
    <p className="field-help">{t('workflowInputHelp')}</p>
    {loading && <p role="status">{t('libraryLoading')}</p>}
    {error && <Banner status="error" title={t('catalogError')} description={<code>{error}</code>}
      endContent={<Button label={t('retryLoad')} onClick={refresh} />} />}
    {!loading && page?.items.length === 0 && <EmptyState isCompact title={t('workflowNoInputs')} />}
    {page && page.items.length > 0 && <div className="business-table"><Table density="compact" aria-label={t('workflowInputs')}>
      <TableHeader><TableRow>
        <TableHeaderCell scope="col">{t('workflowSelect')}</TableHeaderCell>
        <TableHeaderCell scope="col">{t('catalogName')}</TableHeaderCell>
      </TableRow></TableHeader>
      <TableBody>{page.items.map(item => <TableRow key={item.id}>
        <TableCell><CheckboxInput label={t('workflowSelectName', { name: item.name })} isLabelHidden
          value={value.includes(item.id)}
          isDisabled={disabled || loading || (!value.includes(item.id) && value.length >= 100)}
          onChange={checked => onChange(checked ? [...value, item.id] : value.filter(id => id !== item.id))} /></TableCell>
        <TableCell>{item.name}</TableCell>
      </TableRow>)}</TableBody>
    </Table></div>}
    <div className="business-pagination">
      <Button label={t('libraryPrevious')} isDisabled={disabled || loading || offset === 0}
        onClick={() => setOffset(Math.max(0, offset - 25))} />
      <Button label={t('libraryNext')} isDisabled={disabled || loading || !page || offset + 25 >= page.total}
        onClick={() => setOffset(offset + 25)} />
      <Button label={t('workflowClearSelection')} isDisabled={disabled || !value.length} onClick={() => onChange([])} />
    </div>
  </div>;
}
