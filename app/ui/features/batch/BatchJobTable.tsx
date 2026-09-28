import { Button } from '@astryxdesign/core/Button';
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { Pagination } from '@astryxdesign/core/Pagination';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BatchItemView } from '../../../core/batch/batch-contracts';
import { processingSummaryKey } from '../processing/message-key';
import { batchErrorKey } from './errors';
import { batchPhaseKey } from './phase';

const PAGE_SIZE = 25;

interface Props {
  items: BatchItemView[];
  busy: boolean;
  onControl: (command: 'cancel' | 'retry' | 'reveal', id: string) => Promise<void>;
}

/** The queue in run order: one row per job, its commands in the row's ⋯. */
export function BatchJobTable({ items, busy, onControl }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const matches = search
    ? items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    : items;
  const shown = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function actions(item: BatchItemView): DropdownMenuOption[] {
    const menu: DropdownMenuOption[] = [];
    if (['failed', 'cancelled', 'interrupted'].includes(item.state))
      menu.push({ label: t('batchRetry'), onClick: () => void onControl('retry', item.id) });
    if (item.state === 'complete')
      menu.push({ label: t('batchShowOutput'), onClick: () => void onControl('reveal', item.id) });
    if (['queued', 'running', 'interrupted'].includes(item.state))
      menu.push({
        label: t('cancel'),
        variant: 'destructive',
        onClick: () => void onControl('cancel', item.id),
      });
    return menu;
  }

  function phase(item: BatchItemView): string {
    return t(batchPhaseKey(item.progress?.phase ?? ''));
  }

  if (!items.length) return <EmptyState isCompact title={t('batchEmpty')} />;
  return (
    <VStack gap={2}>
      <TextInput
        label={t('catalogSearch')}
        isLabelHidden
        placeholder={t('batchSearchPlaceholder')}
        startIcon="search"
        hasClear
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />
      {!matches.length ? (
        <EmptyState
          isCompact
          title={t('batchNoMatches')}
          actions={<Button label={t('catalogClearSearch')} onClick={() => setSearch('')} />}
        />
      ) : (
        <List hasDividers density="compact" aria-label={t('batchQueue')}>
          {shown.map((item) => {
            const progress = item.state === 'running' ? item.progress : null;
            const meta = [
              progress ? phase(item) : t(`batchState_${item.state}`),
              item.error_code ? t(batchErrorKey(item.error_code)) : '',
              item.attempt > 1 ? t('batchAttempt', { n: item.attempt }) : '',
              item.processing ? t(processingSummaryKey(item.processing)) : '',
              item.subtitle_name ?? '',
              item.output_name ?? '',
            ]
              .filter(Boolean)
              .join(' · ');
            const menu = actions(item);
            const problem = item.state === 'failed' || item.state === 'interrupted';
            return (
              <ListItem
                key={item.id}
                // Tests locate rows by these attributes (batch.test.mjs, folder.test.mjs).
                data-job-id={item.id}
                data-state={item.state}
                label={item.name}
                description={
                  progress ? (
                    <VStack gap={1}>
                      <Text type="body" color="secondary" maxLines={1}>
                        {meta}
                      </Text>
                      <ProgressBar
                        label={phase(item)}
                        isLabelHidden
                        max={1}
                        value={progress.fraction ?? undefined}
                        isIndeterminate={progress.fraction === null}
                      />
                    </VStack>
                  ) : (
                    meta
                  )
                }
                endContent={
                  <HStack as="span" gap={1} vAlign="center" paddingInlineStart={2}>
                    {problem && (
                      <StatusDot
                        variant={item.state === 'failed' ? 'error' : 'warning'}
                        label={t(`batchState_${item.state}`)}
                      />
                    )}
                    {menu.length > 0 && (
                      <MoreMenu
                        label={t('batchRowActions', { name: item.name })}
                        size="sm"
                        alignment="end"
                        isDisabled={busy}
                        items={menu}
                      />
                    )}
                  </HStack>
                }
              />
            );
          })}
        </List>
      )}
      {matches.length > PAGE_SIZE && (
        <Pagination
          variant="count"
          size="sm"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={matches.length}
          onChange={setPage}
        />
      )}
    </VStack>
  );
}
