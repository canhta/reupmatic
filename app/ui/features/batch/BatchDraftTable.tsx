import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BatchDraft } from '../../../core/batch/batch-contracts';

interface Props {
  items: BatchDraft[];
  busy: boolean;
  onAttach: (key: string) => Promise<void>;
  onRemoveSubtitle: (key: string) => void;
  onRemoveVideo: (key: string) => void;
}

// UI-CM05 carve-out: this is the pre-submission draft staging list, not a
// saved record — rows are edited in place (attach/remove subtitle, remove
// video) before the batch is ever added to the queue, and their order is
// the order they were picked, the same document-editing-grid case as a cue
// list or composition clip list. It keeps that order (no sort/filter) but
// still gets a search field, since a selection can run to 100 items.
export function BatchDraftTable({ items, busy, onAttach, onRemoveSubtitle, onRemoveVideo }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const filtered = search
    ? items.filter((item) =>
        `${item.name} ${item.subtitle_name ?? ''}`.toLowerCase().includes(search.toLowerCase()),
      )
    : items;
  return (
    <div className="batch-scroll">
      {items.length > 8 && (
        <TextInput
          label={t('catalogSearch')}
          isLabelHidden
          placeholder={t('batchDraftSearchPlaceholder')}
          startIcon="search"
          hasClear
          value={search}
          onChange={setSearch}
        />
      )}
      {!filtered.length ? (
        <EmptyState
          isCompact
          title={t('batchDraftNoMatches')}
          actions={<Button label={t('catalogClearSearch')} onClick={() => setSearch('')} />}
        />
      ) : (
        <Table density="compact" verticalAlign="top" aria-label={t('batchDraftNote')}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell scope="col">{t('batchVideo')}</TableHeaderCell>
              <TableHeaderCell scope="col">{t('batchSubtitle')}</TableHeaderCell>
              <TableHeaderCell scope="col">{t('batchActions')}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => (
              <TableRow key={item.draft_key}>
                <TableCell>
                  <Text type="body" className="queue-file">
                    {item.name}
                  </Text>
                </TableCell>
                <TableCell>{item.subtitle_name ?? t('batchNoSubtitle')}</TableCell>
                <TableCell>
                  <div className="action-row">
                    <Button
                      label={t('batchAttachSrt')}
                      isDisabled={busy}
                      onClick={() => void onAttach(item.draft_key)}
                    />
                    {item.subtitle_id && (
                      <Button
                        label={t('batchRemoveSrt')}
                        isDisabled={busy}
                        onClick={() => onRemoveSubtitle(item.draft_key)}
                      />
                    )}
                    <Button
                      label={t('batchRemoveVideo')}
                      isDisabled={busy}
                      onClick={() => onRemoveVideo(item.draft_key)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
