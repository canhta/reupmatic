import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
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
                  <HStack gap={2} vAlign="center" wrap="wrap">
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
                  </HStack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
