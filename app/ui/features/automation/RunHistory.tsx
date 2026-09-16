import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { workflowRunState } from '../../../core/automation/run-state';
import { BatchJobTable } from '../batch/BatchJobTable';
import type { useBatchQueue } from '../batch/useBatchQueue';
import { useCatalog } from '../catalog/CatalogProvider';

export function RunHistory({
  queue,
  selected,
  onSelect,
}: {
  queue: ReturnType<typeof useBatchQueue>;
  selected: string;
  onSelect(id: string): void;
}) {
  const { t, i18n } = useTranslation();
  const catalog = useCatalog();
  const [page, setPage] = useState(0);
  const runs = catalog.snapshot?.runs ?? [];
  const offset = Math.min(page * 25, Math.max(0, Math.ceil(runs.length / 25) - 1) * 25);
  const run = runs.find((item) => item.id === selected);
  const jobs = queue.snapshot?.items ?? [];
  const related = run ? jobs.filter((job) => run.job_ids.includes(job.id)) : [];

  return (
    <div className="business-workspace">
      <p>{t('workflowRunsHelp')}</p>
      {!runs.length ? (
        <EmptyState title={t('workflowRunsEmpty')} description={t('workflowRunsEmptyHelp')} />
      ) : (
        <div className="business-table">
          <Table density="compact" aria-label={t('workflowRuns')}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell scope="col">{t('catalogName')}</TableHeaderCell>
                <TableHeaderCell scope="col">{t('workflowRunTime')}</TableHeaderCell>
                <TableHeaderCell scope="col">{t('catalogState')}</TableHeaderCell>
                <TableHeaderCell scope="col">{t('catalogActions')}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.slice(offset, offset + 25).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.workflow_name}</TableCell>
                  <TableCell>
                    {new Intl.DateTimeFormat(i18n.language, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(item.created_at)}
                  </TableCell>
                  <TableCell>
                    {queue.snapshot
                      ? t(`workflowRun_${workflowRunState(item, jobs)}`)
                      : t('catalogLoading')}
                  </TableCell>
                  <TableCell>
                    <Button label={t('catalogDetails')} onClick={() => onSelect(item.id)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="business-pagination">
        <span>{t('catalogCount', { count: runs.length })}</span>
        <Button
          label={t('libraryPrevious')}
          isDisabled={!offset}
          onClick={() => setPage(Math.max(0, page - 1))}
        />
        <Button
          label={t('libraryNext')}
          isDisabled={offset + 25 >= runs.length}
          onClick={() => setPage(page + 1)}
        />
      </div>
      {run && (
        <div className="business-details">
          <h2>{run.workflow_name}</h2>
          <MetadataList label={{ position: 'top' }}>
            <MetadataListItem label={t('workflowRunId')}>
              <code>{run.id}</code>
            </MetadataListItem>
            <MetadataListItem label={t('workflowRevision')}>
              {run.workflow_revision}
            </MetadataListItem>
            <MetadataListItem label={t('workflowInputs')}>
              {run.input_names.join(', ')}
            </MetadataListItem>
            <MetadataListItem label={t('folderOutput')}>
              <span className="business-path">{run.output_dir}</span>
            </MetadataListItem>
          </MetadataList>
          {run.admission === 'prepared' && (
            <Banner
              status="warning"
              title={t('workflowPrepared')}
              description={t('workflowPreparedHelp')}
              endContent={
                <Button
                  label={t('workflowResumeAdmission')}
                  isDisabled={catalog.busy || !catalog.snapshot?.execution_available}
                  onClick={() =>
                    void catalog.mutate(() =>
                      window.reupmatic.workflowRun({
                        workflow_id: run.workflow_id,
                        expected_revision: run.workflow_revision,
                        request_id: run.id,
                      }),
                    )
                  }
                />
              }
            />
          )}
          {run.admission === 'admitted' && related.length !== run.job_ids.length && (
            <Banner status="warning" title={t('workflowMissingJobs')} />
          )}
          {related.length > 0 && (
            <BatchJobTable items={related} busy={queue.busy} onControl={queue.control} />
          )}
          <Button label={t('workflowOpenQueue')} onClick={() => queue.setExpanded(true)} />
        </div>
      )}
    </div>
  );
}
