import { processingSummaryKey } from '../processing/i18n';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import {
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow,
} from '@astryxdesign/core/Table';
import { useTranslation } from 'react-i18next';
import type { BatchItemView } from '../../../core/batch/batch-types';
import { batchErrorKey } from './errors';

interface Props {
  items: BatchItemView[];
  busy: boolean;
  onControl: (command: 'cancel' | 'retry' | 'reveal', id: string) => Promise<void>;
}

export function BatchJobTable({ items, busy, onControl }: Props) {
  const { t } = useTranslation();
  if (!items.length) {
    return <EmptyState isCompact title={t('batchEmpty')} description={t('batchDraftNote')} />;
  }
  return (
    <div className="batch-scroll">
      <Table density="compact" verticalAlign="top" aria-label={t('batchQueue')}>
        <TableHeader><TableRow>
          <TableHeaderCell scope="col">{t('batchVideo')}</TableHeaderCell>
          <TableHeaderCell scope="col">{t('batchState')}</TableHeaderCell>
          <TableHeaderCell scope="col">{t('batchAttempt')}</TableHeaderCell>
          <TableHeaderCell scope="col">{t('batchActions')}</TableHeaderCell>
        </TableRow></TableHeader>
        <TableBody>{items.map(item => (
          <TableRow key={item.id} data-job-id={item.id} data-state={item.state}>
            <TableCell><div className="queue-file">
              {item.name}
              {item.processing && <small>{t(processingSummaryKey(item.processing))}</small>}
              {item.subtitle_name && <small>{item.subtitle_name}</small>}
              {item.output_name && <small>{item.output_name}</small>}
            </div></TableCell>
            <TableCell>
              <span>{t(`batchState_${item.state}`)}</span>
              {item.state === 'running' && item.progress && (
                <ProgressBar label={t(item.progress.phase.startsWith('processing') ? item.progress.phase : `batchPhase_${item.progress.phase}`)}
                  max={1} value={item.progress.fraction ?? undefined}
                  isIndeterminate={item.progress.fraction === null} />
              )}
              {item.error_code && <p className="inline-error">
                {t(batchErrorKey(item.error_code))} <code>{item.error_code}</code>
              </p>}
            </TableCell>
            <TableCell>{item.attempt}</TableCell>
            <TableCell><div className="action-row">
              {['queued', 'running', 'interrupted'].includes(item.state) && (
                <Button label={t('cancel')} isDisabled={busy}
                  onClick={() => void onControl('cancel', item.id)} />
              )}
              {['failed', 'cancelled', 'interrupted'].includes(item.state) && (
                <Button label={t('batchRetry')} isDisabled={busy}
                  onClick={() => void onControl('retry', item.id)} />
              )}
              {item.state === 'complete' && (
                <Button label={t('batchShowOutput')} isDisabled={busy}
                  onClick={() => void onControl('reveal', item.id)} />
              )}
            </div></TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    </div>
  );
}
