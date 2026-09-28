import { Button } from '@astryxdesign/core/Button';
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { List, ListItem } from '@astryxdesign/core/List';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
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

/** The unsaved selection: one row per video with its SRT, commands in the row's ⋯. */
export function BatchDraftTable({ items, busy, onAttach, onRemoveSubtitle, onRemoveVideo }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const filtered = search
    ? items.filter((item) =>
        `${item.name} ${item.subtitle_name ?? ''}`.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  function actions(item: BatchDraft): DropdownMenuOption[] {
    return [
      { label: t('batchAttachSrt'), onClick: () => void onAttach(item.draft_key) },
      ...(item.subtitle_id
        ? [{ label: t('batchRemoveSrt'), onClick: () => onRemoveSubtitle(item.draft_key) }]
        : []),
      {
        label: t('batchRemoveVideo'),
        variant: 'destructive',
        onClick: () => onRemoveVideo(item.draft_key),
      },
    ];
  }

  return (
    <VStack gap={2}>
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
        <List hasDividers density="compact" aria-label={t('batchNew')}>
          {filtered.map((item) => (
            <ListItem
              key={item.draft_key}
              label={item.name}
              description={item.subtitle_name ?? t('batchNoSubtitle')}
              endContent={
                <MoreMenu
                  label={t('batchRowActions', { name: item.name })}
                  size="sm"
                  alignment="end"
                  isDisabled={busy}
                  items={actions(item)}
                />
              }
            />
          ))}
        </List>
      )}
    </VStack>
  );
}
