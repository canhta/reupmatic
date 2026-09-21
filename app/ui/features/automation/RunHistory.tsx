import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible, CollapsibleGroup } from '@astryxdesign/core/Collapsible';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Pagination } from '@astryxdesign/core/Pagination';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { workflowRunState } from '../../../core/automation/run-state';
import { BatchJobTable } from '../batch/BatchJobTable';
import type { useBatchQueue } from '../batch/useBatchQueue';
import { useCatalog } from '../catalog/CatalogProvider';

const PAGE_SIZE = 25;
type RunOrder = 'newest' | 'oldest';

// `selected` is the single expanded run id.
//
// UI-CM05 carve-out: each row expands into rich, run-specific detail
// (a banner, a nested BatchJobTable, resume actions) that a Table's columns
// cannot hold, so this stays a CollapsibleGroup list rather than a record
// table. It still gets the rule's search and sort — by workflow name and by
// start time — applied to the whole run history, not just the visible page;
// there is no status filter because a run's state is a live, derived value
// (workflowRunState), not a stored field the query could narrow by.
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
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<RunOrder>('newest');
  const [page, setPage] = useState(0);
  const all = catalog.snapshot?.runs ?? [];
  const searched = search
    ? all.filter((run) => run.workflow_name.toLowerCase().includes(search.toLowerCase()))
    : all;
  const runs = [...searched].sort((a, b) =>
    order === 'newest' ? b.created_at - a.created_at : a.created_at - b.created_at,
  );
  const offset = Math.min(
    page * PAGE_SIZE,
    Math.max(0, Math.ceil(runs.length / PAGE_SIZE) - 1) * PAGE_SIZE,
  );
  const jobs = queue.snapshot?.items ?? [];

  return (
    <div className="business-workspace run-history">
      <Toolbar
        label={t('workflowRuns')}
        size="sm"
        startContent={
          <TextInput
            label={t('catalogSearch')}
            isLabelHidden
            placeholder={t('workflowRunsSearchPlaceholder')}
            startIcon="search"
            hasClear
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(0);
            }}
          />
        }
        endContent={
          <div className="action-row">
            <Selector
              label={t('workflowRunsOrder')}
              isLabelHidden
              value={order}
              options={[
                { value: 'newest', label: t('workflowRunsOrder_newest') },
                { value: 'oldest', label: t('workflowRunsOrder_oldest') },
              ]}
              onChange={(value) => {
                setOrder(value as RunOrder);
                setPage(0);
              }}
            />
            <Text type="supporting">{t('workflowRunsCount', { count: runs.length })}</Text>
          </div>
        }
      />
      {!all.length ? (
        <EmptyState title={t('workflowRunsEmpty')} description={t('workflowRunsEmptyHelp')} />
      ) : !runs.length ? (
        <EmptyState
          title={t('workflowRunsNoMatches')}
          actions={<Button label={t('catalogClearSearch')} onClick={() => setSearch('')} />}
        />
      ) : (
        <CollapsibleGroup
          type="single"
          value={selected}
          onChange={(value) => onSelect(typeof value === 'string' ? value : '')}
          hasDividers
          density="compact"
          aria-label={t('workflowRuns')}
        >
          {runs.slice(offset, offset + PAGE_SIZE).map((run) => {
            const state = queue.snapshot ? workflowRunState(run, jobs) : null;
            const related = jobs.filter((job) => run.job_ids.includes(job.id));
            return (
              <Collapsible
                key={run.id}
                value={run.id}
                trigger={
                  <span className="run-row">
                    <Text type="body" weight="semibold" className="run-row-name">
                      {run.workflow_name}
                    </Text>
                    <Text type="body" className="run-row-state" data-state={state ?? undefined}>
                      {state ? t(`workflowRun_${state}`) : t('catalogLoading')}
                    </Text>
                    <Text type="body" className="run-row-time numeric" hasTabularNumbers>
                      {new Intl.DateTimeFormat(i18n.language, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(run.created_at)}
                    </Text>
                  </span>
                }
              >
                <div className="business-details">
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
                      <Text type="body" className="business-path">
                        {run.output_dir}
                      </Text>
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
                          tooltip={
                            catalog.snapshot?.execution_available
                              ? undefined
                              : t('workflowRunUnavailableHelp')
                          }
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
              </Collapsible>
            );
          })}
        </CollapsibleGroup>
      )}
      {runs.length > PAGE_SIZE && (
        <div className="business-pagination">
          <Pagination
            variant="count"
            size="sm"
            page={Math.floor(offset / PAGE_SIZE) + 1}
            pageSize={PAGE_SIZE}
            totalItems={runs.length}
            onChange={(next) => setPage(next - 1)}
          />
        </div>
      )}
    </div>
  );
}
