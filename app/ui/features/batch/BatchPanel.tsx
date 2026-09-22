import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Divider } from '@astryxdesign/core/Divider';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { useTranslation } from 'react-i18next';
import { ProcessingOptions } from '../processing/ProcessingOptions';
import { ProfilePicker } from '../profiles/ProfilePicker';
import { BatchDraftTable } from './BatchDraftTable';
import { BatchJobTable } from './BatchJobTable';
import { batchErrorKey } from './errors';
import type { useBatchQueue } from './useBatchQueue';

export function BatchPanel({
  queue,
  alwaysOpen = false,
}: {
  queue: ReturnType<typeof useBatchQueue>;
  alwaysOpen?: boolean;
}) {
  const { t } = useTranslation();
  const { snapshot, busy } = queue;
  const error = queue.error || snapshot?.fault;
  const live =
    snapshot?.items.filter((item) =>
      ['queued', 'running', 'cancelling', 'interrupted'].includes(item.state),
    ).length ?? 0;
  const done = snapshot?.items.filter((item) => item.state === 'complete').length ?? 0;
  const active = snapshot?.items.find((item) => item.id === snapshot.active_id);

  return (
    <Section
      variant="transparent"
      padding={0}
      className="batch-workspace"
      aria-label={t('batchTitle')}
    >
      <HStack gap={2} vAlign="center" wrap="wrap" role="status">
        <Text type="body">{active ? `${t('batchRunning')} · ${active.name}` : t('queueIdle')}</Text>
        {done > 0 && <Text type="body">{t('batchCompleteCount', { count: done })}</Text>}
        {active && active.state !== 'cancelling' && (
          <Button
            label={t('cancel')}
            isDisabled={busy}
            onClick={() => void queue.control('cancel', active.id)}
          />
        )}
        {snapshot && !snapshot.paused && (
          <Button
            label={t('batchPause')}
            isDisabled={busy}
            onClick={() => void queue.control('pause')}
          />
        )}
      </HStack>
      {error && (
        <Banner
          status="error"
          title={t(batchErrorKey(error))}
          description={<code>{error}</code>}
          endContent={<Button label={t('retryLoad')} onClick={() => void queue.reload()} />}
        />
      )}
      {!snapshot && !error && (
        <Text as="p" type="body" role="status">
          {t('batchLoading')}
        </Text>
      )}
      {alwaysOpen ? (
        <div className="batch-panel-content">
          <BatchContent queue={queue} />
        </div>
      ) : (
        <Collapsible
          trigger={`${t('batchTitle')}${live ? ` (${live})` : ''}`}
          isOpen={queue.expanded}
          onOpenChange={queue.setExpanded}
        >
          <BatchContent queue={queue} />
        </Collapsible>
      )}
    </Section>
  );
}

function BatchContent({ queue }: { queue: ReturnType<typeof useBatchQueue> }) {
  const { t } = useTranslation();
  const { snapshot, drafts, output, busy } = queue;
  return (
    <>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Button
          label={t('batchAddVideos')}
          isDisabled={busy || !snapshot}
          onClick={() => void queue.pickVideos()}
        />
        <Button
          label={t('batchChooseFolder')}
          isDisabled={busy || !snapshot}
          onClick={() => void queue.pickOutput()}
        />
        <Text type="body" className="queue-file">
          {output?.name ?? t('batchNoFolder')}
        </Text>
      </HStack>
      {drafts.length > 100 && <Banner status="warning" title={t('batchSelectionLimit')} />}
      {drafts.length > 0 && (
        <>
          <Text as="p" type="body">
            {t('batchDraftNote')}
          </Text>
          <BatchDraftTable
            items={drafts}
            busy={busy}
            onAttach={queue.attachSubtitle}
            onRemoveSubtitle={queue.removeSubtitle}
            onRemoveVideo={queue.removeVideo}
          />
          <ProfilePicker
            onApply={queue.changeProcessing}
            disabled={busy}
            hasSubtitles={drafts.some((item) => Boolean(item.subtitle_id))}
          />
          <ProcessingOptions
            value={queue.processing}
            onChange={queue.changeProcessing}
            disabled={busy}
            hasSubtitles={drafts.some((item) => Boolean(item.subtitle_id))}
          />
          <Button
            label={t('batchEnqueue', { count: drafts.length })}
            variant="primary"
            isDisabled={busy || !output || drafts.length > 100}
            onClick={() => void queue.enqueue()}
          />
        </>
      )}
      {queue.rejected.length > 0 && (
        <Banner status="warning" title={t('batchRejected')} collapsible={false}>
          {queue.rejected.map((item) => (
            <Text as="p" type="body" key={`${item.name}-${item.code}`}>
              {item.name}: {t(batchErrorKey(item.code))} <code>{item.code}</code>
            </Text>
          ))}
        </Banner>
      )}
      <Divider />
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Heading level={5}>{t('batchQueue')}</Heading>
        {snapshot && <Text type="body">{t(snapshot.paused ? 'batchPaused' : 'queueReady')}</Text>}
        <Button
          label={t('batchStart')}
          isDisabled={
            busy || !snapshot?.paused || !snapshot.items.some((item) => item.state === 'queued')
          }
          onClick={() => void queue.control('resume')}
        />
      </HStack>
      <Text as="p" type="body">
        {t('batchPauseHint')}
      </Text>
      {snapshot?.items.some((item) => item.state === 'interrupted') && (
        <Banner status="warning" title={t('batchRecovered')} />
      )}
      {snapshot && <BatchJobTable items={snapshot.items} busy={busy} onControl={queue.control} />}
    </>
  );
}
