import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import {
  CommandFooter,
  type CommandStatus,
  PanelRows,
  PanelSection,
  PanelSections,
  PanelStatus,
} from '../../design-system/Panel';
import { PathRow } from '../../design-system/PanelControls';
import { ProcessingOptions } from '../processing/ProcessingOptions';
import { ProfilePicker } from '../profiles/ProfilePicker';
import { BatchDraftTable } from './BatchDraftTable';
import { BatchJobTable } from './BatchJobTable';
import { batchErrorKey } from './errors';
import type { useBatchQueue } from './useBatchQueue';

type Queue = ReturnType<typeof useBatchQueue>;

export function BatchPanel({ queue }: { queue: Queue }) {
  const { t } = useTranslation();
  const { snapshot, busy } = queue;
  const error = queue.error || snapshot?.fault;

  return (
    <VStack gap={4}>
      {error && (
        <Banner
          status="error"
          title={t(batchErrorKey(error))}
          endContent={<Button label={t('retryLoad')} onClick={() => void queue.reload()} />}
        />
      )}
      {!snapshot && !error && <PanelStatus tone="neutral" text={t('batchLoading')} />}
      <PanelSections>
        {snapshot && (
          <PanelSection
            key="queue"
            title={t('batchQueue')}
            actions={
              <Text type="body" color="secondary" hasTabularNumbers>
                {t('batchJobsCount', { count: snapshot.items.length })}
              </Text>
            }
            status={
              snapshot.items.some((item) => item.state === 'interrupted')
                ? { tone: 'warning', text: t('batchRecovered') }
                : null
            }
          >
            <BatchJobTable items={snapshot.items} busy={busy} onControl={queue.control} />
          </PanelSection>
        )}
        <BatchDraft key="draft" queue={queue} />
      </PanelSections>
    </VStack>
  );
}

function BatchDraft({ queue }: { queue: Queue }) {
  const { t } = useTranslation();
  const { snapshot, drafts, output, busy } = queue;
  const hasSubtitles = drafts.some((item) => Boolean(item.subtitle_id));
  return (
    <VStack gap={4}>
      <PanelSection
        title={t('batchNew')}
        actions={
          <Button
            label={t('batchAddVideos')}
            size="sm"
            isDisabled={busy || !snapshot}
            onClick={() => void queue.pickVideos()}
          />
        }
        status={drafts.length > 100 ? { tone: 'warning', text: t('batchSelectionLimit') } : null}
      >
        <PanelRows>
          <PathRow
            label={t('batchOutput')}
            value={output?.name}
            chooseLabel={t('batchChooseFolder')}
            isDisabled={busy || !snapshot}
            onChoose={() => void queue.pickOutput()}
          />
        </PanelRows>
        {drafts.length > 0 && (
          <BatchDraftTable
            items={drafts}
            busy={busy}
            onAttach={queue.attachSubtitle}
            onRemoveSubtitle={queue.removeSubtitle}
            onRemoveVideo={queue.removeVideo}
          />
        )}
        {queue.rejected.length > 0 && (
          <Banner status="warning" title={t('batchRejected')} collapsible={false}>
            {queue.rejected.map((item) => (
              <Text as="p" type="body" key={`${item.name}-${item.code}`}>
                {item.name}: {t(batchErrorKey(item.code))}
              </Text>
            ))}
          </Banner>
        )}
      </PanelSection>
      {drafts.length > 0 && (
        <>
          <ProfilePicker
            onApply={queue.changeProcessing}
            disabled={busy}
            hasSubtitles={hasSubtitles}
          />
          <ProcessingOptions
            value={queue.processing}
            onChange={queue.changeProcessing}
            disabled={busy}
            hasSubtitles={hasSubtitles}
          />
          <CommandFooter>
            <Button
              label={t('batchEnqueue')}
              variant="primary"
              isDisabled={busy || !output || drafts.length > 100}
              onClick={() => void queue.enqueue()}
            />
          </CommandFooter>
        </>
      )}
    </VStack>
  );
}

/** The tray's footer: the queue's state, then its one control (Start while paused, else Pause). */
export function BatchQueueFooter({ queue }: { queue: Queue }) {
  const { t } = useTranslation();
  const { snapshot, busy } = queue;
  if (!snapshot) return null;
  const active = snapshot.items.find((item) => item.id === snapshot.active_id);
  const done = snapshot.items.filter((item) => item.state === 'complete').length;
  const waiting = snapshot.items.some((item) => item.state === 'queued');
  const state = active
    ? `${t('batchState_running')} · ${active.name}`
    : snapshot.paused
      ? t('batchPaused')
      : t('queueIdle');
  const status: CommandStatus = {
    tone: active ? 'success' : snapshot.paused && waiting ? 'warning' : 'neutral',
    text: done > 0 ? `${state} · ${t('batchCompleteCount', { count: done })}` : state,
  };
  return (
    <CommandFooter
      status={status}
      menuLabel={t('batchQueueActions')}
      menu={
        active && active.state !== 'cancelling'
          ? [
              {
                label: t('batchCancelActive'),
                variant: 'destructive',
                isDisabled: busy,
                onClick: () => void queue.control('cancel', active.id),
              },
            ]
          : []
      }
    >
      {snapshot.paused ? (
        <Button
          label={t('batchStart')}
          variant="primary"
          isDisabled={busy || !waiting}
          onClick={() => void queue.control('resume')}
        />
      ) : (
        <Button
          label={t('batchPause')}
          isDisabled={busy}
          onClick={() => void queue.control('pause')}
        />
      )}
    </CommandFooter>
  );
}
