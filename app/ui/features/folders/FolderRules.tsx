import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Section } from '@astryxdesign/core/Section';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import { useTranslation } from 'react-i18next';
import type { FolderSnapshot } from '../../../core/folders/folder-types';
import { processingSummaryKey } from '../processing/i18n';
import { folderErrorKey } from './errors';

interface Props {
  snapshot: FolderSnapshot;
  busy: boolean;
  onControl: (id: string, command: 'start' | 'pause') => Promise<void>;
}

export function FolderRules({ snapshot, busy, onControl }: Props) {
  const { t, i18n } = useTranslation();
  return (
    <Section
      variant="transparent"
      padding={0}
      className="folder-rules"
      aria-labelledby="folder-rules-title"
    >
      <div className="workspace-heading">
        <h2 id="folder-rules-title">{t('folderRules')}</h2>
        <span className="count-label">{snapshot.rules.length}</span>
      </div>
      {snapshot.queue_paused && snapshot.rules.some((rule) => rule.state !== 'paused') && (
        <Banner status="warning" title={t('folderQueuePaused')} />
      )}
      {!snapshot.rules.length ? (
        <EmptyState title={t('folderEmptyTitle')} description={t('folderEmptyBody')} />
      ) : (
        <div className="folder-scroll">
          <Table density="compact" verticalAlign="top" aria-label={t('folderRules')}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell scope="col">{t('folderRoute')}</TableHeaderCell>
                <TableHeaderCell scope="col">{t('batchState')}</TableHeaderCell>
                <TableHeaderCell scope="col">{t('folderAdmitted')}</TableHeaderCell>
                <TableHeaderCell scope="col">{t('batchActions')}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshot.rules.map((rule) => (
                <TableRow key={rule.id} data-state={rule.state}>
                  <TableCell>
                    <strong className="folder-path">{rule.source_name}</strong>
                    <span className="folder-path">
                      {t('folderTo', { folder: rule.output_name })}
                    </span>
                    {rule.processing && <small>{t(processingSummaryKey(rule.processing))}</small>}
                    <small>
                      {t(rule.include_existing ? 'folderAllExisting' : 'folderNewOnly')}
                      {rule.recursive ? ` · ${t('folderRecursive')}` : ''}
                    </small>
                  </TableCell>
                  <TableCell>
                    <span>{t(`folderState_${rule.state}`)}</span>
                    {rule.last_scan !== null && (
                      <small>
                        {t('folderLastScan', {
                          time: new Date(rule.last_scan).toLocaleTimeString(i18n.language),
                        })}
                      </small>
                    )}
                    {rule.error_code && (
                      <p className="inline-error">
                        {t(folderErrorKey(rule.error_code))} <code>{rule.error_code}</code>
                        {rule.error_file && <small>{rule.error_file}</small>}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="numeric">{rule.admitted}</span>
                  </TableCell>
                  <TableCell>
                    <Button
                      label={t(rule.state === 'paused' ? 'folderStart' : 'folderPause')}
                      isDisabled={busy || (rule.state === 'paused' && !snapshot.available)}
                      onClick={() =>
                        void onControl(rule.id, rule.state === 'paused' ? 'start' : 'pause')
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="field-help">{t('folderLifecycle')}</p>
    </Section>
  );
}
