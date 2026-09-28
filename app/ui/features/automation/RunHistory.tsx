import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { Pagination } from '@astryxdesign/core/Pagination';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { workflowRunState } from '../../../core/automation/run-state';
import type { RunState, WorkflowRunView } from '../../../core/automation/workflow-contracts';
import { CommandFooter, type CommandStatus, PanelRows, ValueRow } from '../../design-system/Panel';
import { WorkspaceDrawer } from '../../shell/WorkspaceFrame';
import { BatchJobTable } from '../batch/BatchJobTable';
import type { useBatchQueue } from '../batch/useBatchQueue';
import { useCatalog } from '../catalog/CatalogProvider';

const PAGE_SIZE = 25;
type RunOrder = 'newest' | 'oldest';

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
  const time = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const open = all.find((run) => run.id === selected);

  return (
    <VStack gap={3} isScrollable>
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
          <HStack gap={2} vAlign="center">
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
          </HStack>
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
        <List hasDividers density="compact">
          {runs.slice(offset, offset + PAGE_SIZE).map((run) => {
            const state = queue.snapshot ? workflowRunState(run, jobs) : null;
            return (
              <ListItem
                key={run.id}
                label={run.workflow_name}
                description={time.format(run.created_at)}
                isSelected={run.id === selected}
                onClick={() => onSelect(run.id === selected ? '' : run.id)}
                endContent={<RunStateText state={state} />}
              />
            );
          })}
        </List>
      )}
      {runs.length > PAGE_SIZE && (
        <Pagination
          variant="count"
          size="sm"
          page={Math.floor(offset / PAGE_SIZE) + 1}
          pageSize={PAGE_SIZE}
          totalItems={runs.length}
          onChange={(next) => setPage(next - 1)}
        />
      )}
      <WorkspaceDrawer
        open={Boolean(open)}
        label={open?.workflow_name ?? t('workflowRuns')}
        onClose={() => onSelect('')}
        footer={open && <RunFooter run={open} queue={queue} />}
      >
        {open && <RunDetails run={open} queue={queue} />}
      </WorkspaceDrawer>
    </VStack>
  );
}

// Normal states read as plain text; only a run that needs attention carries a dot.
const ATTENTION: Partial<Record<RunState, 'error' | 'warning'>> = {
  failed: 'error',
  partial: 'warning',
  interrupted: 'warning',
  prepared: 'warning',
};

function RunStateText({ state }: { state: RunState | null }) {
  const { t } = useTranslation();
  const label = state ? t(`workflowRun_${state}`) : t('catalogLoading');
  const tone = state ? ATTENTION[state] : undefined;
  return (
    <HStack gap={2} vAlign="center">
      {tone && <StatusDot variant={tone} label={label} />}
      <Text type="body">{label}</Text>
    </HStack>
  );
}

function RunDetails({
  run,
  queue,
}: {
  run: WorkflowRunView;
  queue: ReturnType<typeof useBatchQueue>;
}) {
  const { t } = useTranslation();
  const related = (queue.snapshot?.items ?? []).filter((job) => run.job_ids.includes(job.id));
  return (
    <VStack gap={4}>
      <PanelRows>
        <ValueRow label={t('workflowRunId')}>{run.id}</ValueRow>
        <ValueRow label={t('workflowRevision')}>{run.workflow_revision}</ValueRow>
        <ValueRow label={t('workflowInputs')}>{run.input_names.join(', ')}</ValueRow>
        <ValueRow label={t('workflowStepOutputs')}>{run.output_dir}</ValueRow>
      </PanelRows>
      {related.length > 0 && (
        <BatchJobTable items={related} busy={queue.busy} onControl={queue.control} />
      )}
    </VStack>
  );
}

function RunFooter({
  run,
  queue,
}: {
  run: WorkflowRunView;
  queue: ReturnType<typeof useBatchQueue>;
}) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const related = (queue.snapshot?.items ?? []).filter((job) => run.job_ids.includes(job.id));
  const available = Boolean(catalog.snapshot?.execution_available);
  const status: CommandStatus | null =
    run.admission === 'prepared'
      ? { tone: 'warning', text: t('workflowPrepared') }
      : run.admission === 'admitted' && related.length !== run.job_ids.length
        ? { tone: 'warning', text: t('workflowMissingJobs') }
        : null;
  return (
    <CommandFooter status={status}>
      <Button label={t('workflowOpenQueue')} onClick={() => queue.setExpanded(true)} />
      {run.admission === 'prepared' && (
        <Button
          label={t('workflowResumeAdmission')}
          variant="primary"
          tooltip={available ? t('workflowPreparedHelp') : t('workflowRunUnavailableHelp')}
          isDisabled={catalog.busy || !available}
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
      )}
    </CommandFooter>
  );
}
