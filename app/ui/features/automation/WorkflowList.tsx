import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import type { TableColumn } from '@astryxdesign/core/Table';
import {
  paginateData,
  pixel,
  proportional,
  Table,
  useTablePagination,
  useTableSortable,
  useTableSortableState,
} from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Workflow } from '../../../core/automation/workflow-contracts';

const PAGE_SIZE = 25;

// Table's data-driven plugins require T extends Record<string, unknown>;
// Workflow is a plain named type with no index signature, so it needs this
// wrapper per Table's own documented pattern.
interface WorkflowRow extends Workflow, Record<string, unknown> {
  lastRun: string;
}

export function WorkflowList({
  workflows,
  disabled,
  executionAvailable,
  lastRunOutcome,
  onCreate,
  onEdit,
  onRun,
}: {
  workflows: Workflow[];
  disabled: boolean;
  executionAvailable: boolean;
  lastRunOutcome(workflowId: string): string;
  onCreate(): void;
  onEdit(workflow: Workflow): void;
  onRun(workflow: Workflow): void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const all: WorkflowRow[] = workflows.map((workflow) => ({
    ...workflow,
    lastRun: lastRunOutcome(workflow.id),
  }));
  const searched = search
    ? all.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    : all;

  // Not memoized: onEdit/onRun close over per-render state, and re-deriving
  // five column defs each render is cheap.
  const columns: TableColumn<WorkflowRow>[] = [
    {
      key: 'name',
      header: t('catalogName'),
      width: proportional(2),
      sortable: true,
      renderCell: (workflow) => (
        <>
          <button type="button" className="business-row-open" onClick={() => onEdit(workflow)}>
            {workflow.name}
          </button>
          {workflow.archived && (
            <Text as="p" type="supporting">
              {t('catalogArchived')}
            </Text>
          )}
        </>
      ),
    },
    {
      key: 'trigger',
      header: t('workflowTrigger'),
      width: proportional(1),
      renderCell: () => t('workflowTriggerManual'),
    },
    {
      key: 'lastRun',
      header: t('workflowLastRun'),
      width: proportional(1),
      sortable: true,
    },
    {
      key: 'actions',
      header: t('catalogActions'),
      width: pixel(280),
      resizable: false,
      renderCell: (workflow) => (
        <div className="action-row">
          <Button
            label={t('catalogEdit')}
            isDisabled={disabled}
            data-workflow-focus={`edit-${workflow.id}`}
            onClick={(event) => {
              event.stopPropagation();
              onEdit(workflow);
            }}
          />
          <Button
            label={t('workflowQueue')}
            tooltip={executionAvailable ? undefined : t('workflowRunUnavailableHelp')}
            isDisabled={disabled || workflow.archived || !executionAvailable}
            onClick={(event) => {
              event.stopPropagation();
              onRun(workflow);
            }}
          />
          {!executionAvailable && (
            <Text type="body" className="run-state">
              {t('workflowRunUnavailable')}
            </Text>
          )}
        </div>
      ),
    },
  ];

  const { sortedData, sortConfig } = useTableSortableState<WorkflowRow>({
    data: searched,
    defaultSort: [{ sortKey: 'name', direction: 'ascending' }],
  });
  const sortPlugin = useTableSortable<WorkflowRow>(sortConfig);
  const showPagination = sortedData.length > PAGE_SIZE;
  const paginationPlugin = useTablePagination<WorkflowRow>({
    page,
    onPageChange: setPage,
    totalItems: sortedData.length,
    pageSize: PAGE_SIZE,
    variant: 'count',
  });
  const pageData = showPagination ? paginateData(sortedData, page, PAGE_SIZE) : sortedData;

  return (
    <div className="business-list">
      <Toolbar
        label={t('workflowsTitle')}
        size="sm"
        startContent={
          <TextInput
            label={t('catalogSearch')}
            isLabelHidden
            placeholder={t('workflowsSearchPlaceholder')}
            startIcon="search"
            hasClear
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
        }
        endContent={
          <div className="action-row">
            <Text type="supporting">{t('workflowsCount', { count: sortedData.length })}</Text>
            <Button
              label={t('workflowNew')}
              variant="primary"
              className="business-toolbar-primary"
              tooltip={t('workflowNew')}
              isDisabled={disabled}
              onClick={onCreate}
              data-workflow-focus="create"
            />
          </div>
        }
      />
      {!all.length ? (
        <EmptyState
          title={t('workflowsEmpty')}
          actions={<Button label={t('workflowNew')} variant="primary" onClick={onCreate} />}
        />
      ) : (
        <div className="business-table">
          <Table
            density="compact"
            aria-label={t('workflowsTitle')}
            idKey="id"
            data={pageData}
            columns={columns}
            plugins={{
              sort: sortPlugin,
              ...(showPagination ? { pagination: paginationPlugin } : {}),
            }}
            emptyState={
              <EmptyState
                title={t('workflowsNoMatches')}
                actions={<Button label={t('catalogClearSearch')} onClick={() => setSearch('')} />}
              />
            }
          />
        </div>
      )}
    </div>
  );
}
