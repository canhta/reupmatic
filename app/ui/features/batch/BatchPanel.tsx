import { ProfilePicker } from '../profiles/ProfilePicker';
import { ProcessingOptions } from '../processing/ProcessingOptions';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Divider } from '@astryxdesign/core/Divider';
import { Section } from '@astryxdesign/core/Section';
import { useTranslation } from 'react-i18next';
import { BatchDraftTable } from './BatchDraftTable';
import { BatchJobTable } from './BatchJobTable';
import { batchErrorKey } from './errors';
import type { useBatchQueue } from './useBatchQueue';

export function BatchPanel({ queue }: { queue: ReturnType<typeof useBatchQueue> }) {
  const { t } = useTranslation();
  const { snapshot, drafts, output, busy } = queue;
  const error = queue.error || snapshot?.fault;
  const live = snapshot?.items.filter(item =>
    ['queued', 'running', 'cancelling', 'interrupted'].includes(item.state)).length ?? 0;
  const done = snapshot?.items.filter(item => item.state === 'complete').length ?? 0;
  const active = snapshot?.items.find(item => item.id === snapshot.active_id);

  return (
    <Section variant="transparent" padding={0} className="batch-workspace" aria-label={t('batchTitle')}>
      <div className="action-row" role="status">
        <span>{active ? `${t('batchRunning')} · ${active.name}` : t('queueIdle')}</span>
        {done > 0 && <span>{t('batchCompleteCount', { count: done })}</span>}
        {active && active.state !== 'cancelling' && (
          <Button label={t('cancel')} isDisabled={busy}
            onClick={() => void queue.control('cancel', active.id)} />
        )}
        {snapshot && !snapshot.paused && (
          <Button label={t('batchPause')} isDisabled={busy}
            onClick={() => void queue.control('pause')} />
        )}
      </div>
      {error && <Banner status="error" title={t(batchErrorKey(error))}
        description={<code>{error}</code>}
        endContent={<Button label={t('retryLoad')} onClick={() => void queue.reload()} />} />}
      {!snapshot && !error && <p role="status">{t('batchLoading')}</p>}
      <Collapsible trigger={`${t('batchTitle')}${live ? ` (${live})` : ''}`} isOpen={queue.expanded} onOpenChange={queue.setExpanded}>
        <p>{t('batchScope')}</p>
        <div className="action-row">
          <Button label={t('batchAddVideos')} isDisabled={busy || !snapshot}
            onClick={() => void queue.pickVideos()} />
          <Button label={t('batchChooseFolder')} isDisabled={busy || !snapshot}
            onClick={() => void queue.pickOutput()} />
          <span className="queue-file">{output?.name ?? t('batchNoFolder')}</span>
        </div>
        {drafts.length > 100 && <Banner status="warning" title={t('batchSelectionLimit')} />}
        {drafts.length > 0 && <>
          <p>{t('batchDraftNote')}</p>
          <BatchDraftTable items={drafts} busy={busy} onAttach={queue.attachSubtitle}
            onRemoveSubtitle={queue.removeSubtitle} onRemoveVideo={queue.removeVideo} />
          <ProfilePicker onApply={queue.changeProcessing} disabled={busy}
            hasSubtitles={drafts.some(item => Boolean(item.subtitle_id))} />
          <ProcessingOptions value={queue.processing} onChange={queue.changeProcessing}
            disabled={busy} hasSubtitles={drafts.some(item => Boolean(item.subtitle_id))} />
          <Button label={t('batchEnqueue', { count: drafts.length })} variant="primary"
            isDisabled={busy || !output || drafts.length > 100}
            onClick={() => void queue.enqueue()} />
        </>}
        {queue.rejected.length > 0 && <Banner status="warning" title={t('batchRejected')}
          collapsible={false}>
          {queue.rejected.map((item, index) => <p key={`${item.name}-${index}`}>
            {item.name}: {t(batchErrorKey(item.code))} <code>{item.code}</code>
          </p>)}
        </Banner>}
        <Divider />
        <div className="action-row">
          <h2>{t('batchQueue')}</h2>
          {snapshot && <span>{t(snapshot.paused ? 'batchPaused' : 'queueReady')}</span>}
          <Button label={t('batchStart')} isDisabled={busy || !snapshot?.paused
            || !snapshot.items.some(item => item.state === 'queued')}
            onClick={() => void queue.control('resume')} />
        </div>
        <p>{t('batchPauseHint')}</p>
        {snapshot?.items.some(item => item.state === 'interrupted') && (
          <Banner status="warning" title={t('batchRecovered')} />
        )}
        {snapshot && <BatchJobTable items={snapshot.items} busy={busy} onControl={queue.control} />}
      </Collapsible>
    </Section>
  );
}
