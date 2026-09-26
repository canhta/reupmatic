import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Selector } from '@astryxdesign/core/Selector';
import type { TableColumn } from '@astryxdesign/core/Table';
import {
  proportional,
  Table,
  useTableSortable,
  useTableStickyColumns,
} from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Token } from '@astryxdesign/core/Token';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ModelTask,
  OfferedCatalogue,
  OfferedModel,
} from '../../../core/speech/model-catalogue';
import { unwrap } from '../../bridge/client';
import { useNotifications } from '../../shell/NotificationsProvider';
import { formatBytes, phaseKey, purposeFor, taskKey } from '../speech/offered-model-text';
import { offeredModelErrorKey } from './offered-model-error-message';

interface Active {
  catalogueId: string;
  requestId: string;
  phase: string;
  fraction: number | null;
}

type TaskFilter = ModelTask | 'all';
type StatusFilter = 'all' | 'installed' | 'available';
type SortKey = 'name' | 'task' | 'engine' | 'languages' | 'size' | 'source';
type SortState = Array<{ sortKey: SortKey; direction: 'ascending' | 'descending' }>;

// Sort reads row[sortKey], so sortable values must be plain fields, not derivations.
interface ModelRow extends Record<string, unknown> {
  id: string;
  name: string;
  task: string;
  engine: string;
  languages: string;
  size: number;
  source: string;
  model: OfferedModel;
}

function detailFor(model: OfferedModel, objectRemoval: string): string {
  if (model.task === 'translation') return `${model.source_language} → ${model.target_language}`;
  if (model.task === 'vision') {
    const ocr = model.ocr ? Object.keys(model.ocr).join(', ') : '';
    return [ocr, model.inpainting ? objectRemoval : ''].filter(Boolean).join(' · ');
  }
  return model.languages.join(', ');
}

const TASK_ORDER: ModelTask[] = ['recognition', 'synthesis', 'translation', 'vision'];

export function OfferedModels() {
  const { t, i18n } = useTranslation();
  const { raiseError } = useNotifications();
  const [catalogue, setCatalogue] = useState<OfferedCatalogue | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState<Active | null>(null);
  const [starting, setStarting] = useState(false);
  const [removing, setRemoving] = useState<OfferedModel | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortState>([]);
  const activeRef = useRef<Active | null>(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const value = await unwrap(window.reupmatic.speechOfferedModels());
      if (!alive.current) return;
      setCatalogue(value);
      const current = activeRef.current;
      if (value.active && current?.requestId !== value.active.request_id) {
        const adopted: Active = {
          catalogueId: value.active.catalogue_id,
          requestId: value.active.request_id,
          phase: value.active.phase,
          fraction: value.active.fraction,
        };
        activeRef.current = adopted;
        setActive(adopted);
      } else if (!value.active && current) {
        activeRef.current = null;
        setActive(null);
      }
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const offInstall = window.reupmatic.onSpeechModelInstall((message) => {
      const current = activeRef.current;
      if (!current || message.id !== current.requestId) return;
      if (message.event === 'progress') {
        const next = { ...current, phase: message.data.phase, fraction: message.data.fraction };
        activeRef.current = next;
        setActive(next);
        return;
      }
      activeRef.current = null;
      setActive(null);
      if (message.event === 'error') setError(message.data.code);
      void reload();
    });
    const offModels = window.reupmatic.onSpeechModelsChanged(() => void reload());
    const offSynthesis = window.reupmatic.onSynthesisModelsChanged(() => void reload());
    const offTranslation = window.reupmatic.onTranslationModelsChanged(() => void reload());
    const offVision = window.reupmatic.onModelsChanged(() => void reload());
    void reload();
    return () => {
      // Deliberately does not cancel a running install; only the explicit Cancel button stops it.
      alive.current = false;
      activeRef.current = null;
      offInstall();
      offModels();
      offSynthesis();
      offTranslation();
      offVision();
    };
  }, [reload]);

  async function download(model: OfferedModel) {
    setError('');
    setStarting(true);
    try {
      const { request_id } = await unwrap(window.reupmatic.speechModelInstallStart(model.id));
      if (!alive.current) return;
      const next: Active = {
        catalogueId: model.id,
        requestId: request_id,
        phase: 'downloading',
        fraction: 0,
      };
      activeRef.current = next;
      setActive(next);
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    } finally {
      if (alive.current) setStarting(false);
    }
  }

  async function cancel() {
    const current = activeRef.current;
    if (!current) return;
    const next = { ...current, phase: 'cancelling', fraction: null };
    activeRef.current = next;
    setActive(next);
    try {
      await unwrap(window.reupmatic.speechModelInstallCancel(current.requestId));
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    }
  }

  async function remove(model: OfferedModel) {
    setRemovingBusy(true);
    try {
      await unwrap(window.reupmatic.speechModelRemove(model.id));
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : 'WORKER_FAILURE';
      if (alive.current) raiseError(t(offeredModelErrorKey(code)));
    } finally {
      if (alive.current) {
        setRemovingBusy(false);
        setRemoving(null);
      }
      void reload();
    }
  }

  const rows: ModelRow[] = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = (catalogue?.models ?? [])
      .filter((model) => taskFilter === 'all' || model.task === taskFilter)
      .filter((model) =>
        statusFilter === 'all'
          ? true
          : statusFilter === 'installed'
            ? model.installed
            : !model.installed,
      )
      .filter(
        (model) =>
          !needle ||
          model.id.toLowerCase().includes(needle) ||
          model.engine.toLowerCase().includes(needle),
      )
      .map((model) => ({
        id: model.id,
        name: model.id,
        task: model.task,
        engine: model.engine,
        languages: detailFor(model, t('settingsOfferedInpainting')),
        size: model.download_size,
        source: `${model.source_host} ${model.licence}`,
        model,
      }));
    if (sort.length === 0) {
      return list.sort(
        (a, b) =>
          TASK_ORDER.indexOf(a.model.task) - TASK_ORDER.indexOf(b.model.task) ||
          a.name.localeCompare(b.name),
      );
    }
    return list.sort((a, b) => {
      for (const { sortKey, direction } of sort) {
        const left = a[sortKey];
        const right = b[sortKey];
        const compared =
          typeof left === 'number' && typeof right === 'number'
            ? left - right
            : String(left).localeCompare(String(right));
        if (compared !== 0) return direction === 'ascending' ? compared : -compared;
      }
      return 0;
    });
  }, [catalogue, taskFilter, statusFilter, search, sort, t]);

  const columns: TableColumn<ModelRow>[] = [
    {
      key: 'name',
      header: t('settingsOfferedColumnModel'),
      width: proportional(3),
      sortable: true,
      renderCell: (row) => (
        <VStack gap={1}>
          <Text as="span" type="body">
            {row.model.id}
          </Text>
          <Text as="span" type="supporting">
            {purposeFor(row.model, i18n.language)}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'task',
      header: t('settingsOfferedColumnTask'),
      width: proportional(1),
      sortable: true,
      renderCell: (row) => t(taskKey(row.model.task)),
    },
    {
      key: 'engine',
      header: t('settingsOfferedColumnEngine'),
      width: proportional(1),
      sortable: true,
      renderCell: (row) => row.model.engine,
    },
    {
      key: 'languages',
      header: t('settingsOfferedColumnLanguages'),
      width: proportional(1),
      sortable: true,
      renderCell: (row) => detailFor(row.model, t('settingsOfferedInpainting')),
    },
    {
      key: 'size',
      header: t('settingsOfferedColumnSize'),
      width: proportional(1),
      sortable: true,
      renderCell: (row) => (
        <VStack gap={1}>
          <Text as="span" type="body">
            {formatBytes(row.model.download_size, i18n.language)}
          </Text>
          {row.model.runtime_pack && (
            <Text as="span" type="supporting">
              {row.model.runtime_pack.installed
                ? t('settingsOfferedRuntimePackInstalled', { name: row.model.runtime_pack.name })
                : t('settingsOfferedRuntimePack', {
                    name: row.model.runtime_pack.name,
                    size: formatBytes(row.model.runtime_pack.size, i18n.language),
                  })}
            </Text>
          )}
        </VStack>
      ),
    },
    {
      key: 'source',
      header: t('settingsOfferedColumnSource'),
      width: proportional(2),
      sortable: true,
      renderCell: (row) => (
        <Text as="span" type="supporting">
          {t('settingsOfferedSource', {
            host: row.model.source_host,
            licence: row.model.licence,
          })}
        </Text>
      ),
    },
    {
      key: 'action',
      header: t('settingsOfferedColumnAction'),
      width: proportional(1),
      renderCell: (row) => {
        const rowActive = active?.catalogueId === row.model.id ? active : null;
        if (row.model.installed) {
          return (
            <Button
              size="sm"
              variant="destructive"
              label={`${row.model.id}: ${t('settingsOfferedRemove')}`}
              isDisabled={Boolean(active) || starting || removingBusy}
              onClick={() => setRemoving(row.model)}
            >
              {t('settingsOfferedRemove')}
            </Button>
          );
        }
        if (rowActive) {
          const phase =
            rowActive.phase === 'cancelling' ? t('cancelling') : t(phaseKey(rowActive.phase));
          const percent =
            rowActive.fraction === null ? '' : ` ${Math.round(rowActive.fraction * 100)}%`;
          const label = `${phase}${percent}`;
          return (
            <Button
              variant="secondary"
              size="sm"
              label={label}
              isDisabled={rowActive.phase === 'cancelling'}
              onClick={() => void cancel()}
            >
              {label}
            </Button>
          );
        }
        return (
          <Button
            label={t('settingsOfferedDownload')}
            size="sm"
            isDisabled={starting || Boolean(active)}
            onClick={() => void download(row.model)}
          />
        );
      },
    },
  ];

  const sortPlugin = useTableSortable<ModelRow, SortKey>({
    sort,
    onSortChange: (next) => setSort(next),
    allowUnsortedState: true,
  });
  const sticky = useTableStickyColumns<ModelRow>({ endKeys: ['action'] });

  if (catalogue === null) {
    return error ? (
      <Banner
        status="error"
        title={t('settingsOfferedFailure')}
        description={t(offeredModelErrorKey(error))}
        endContent={
          <Button
            label={t('retryLoad')}
            size="sm"
            onClick={() => {
              setError('');
              void reload();
            }}
          />
        }
      />
    ) : (
      <Text as="p" type="body" role="status">
        {t('settingsOfferedLoading')}
      </Text>
    );
  }
  if (catalogue.models.length === 0 && catalogue.refused.length === 0 && !error) return null;

  return (
    <VStack gap={3}>
      <Heading level={2}>{t('settingsOfferedTitle')}</Heading>
      {error && (
        <Banner
          status="error"
          title={t('settingsOfferedFailure')}
          description={t(offeredModelErrorKey(error))}
        />
      )}
      {catalogue.refused.length > 0 && (
        <Banner
          status="warning"
          title={t('settingsOfferedRefusedTitle')}
          description={
            <VStack gap={1}>
              {catalogue.refused.map((entry) => (
                <Text as="span" type="supporting" key={`${entry.id}:${entry.code}`}>
                  {t('settingsOfferedRefused', { id: entry.id || '—' })}{' '}
                  {t(offeredModelErrorKey(entry.code))}
                </Text>
              ))}
            </VStack>
          }
        />
      )}
      <Toolbar
        label={t('settingsOfferedTitle')}
        size="sm"
        startContent={
          <TextInput
            label={t('settingsOfferedSearch')}
            isLabelHidden
            placeholder={t('settingsOfferedSearch')}
            startIcon="search"
            hasClear
            value={search}
            onChange={setSearch}
          />
        }
        endContent={
          <HStack gap={2} vAlign="center">
            <Token size="sm" label={t('settingsOfferedCount', { count: rows.length })} />
            <Selector
              label={t('settingsOfferedColumnTask')}
              isLabelHidden
              value={taskFilter}
              options={[
                { value: 'all', label: t('settingsOfferedAllTasks') },
                ...TASK_ORDER.map((task) => ({ value: task, label: t(taskKey(task)) })),
              ]}
              onChange={(value) => setTaskFilter(value as TaskFilter)}
            />
            <Selector
              label={t('settingsOfferedColumnStatus')}
              isLabelHidden
              value={statusFilter}
              options={[
                { value: 'all', label: t('settingsOfferedStatusAll') },
                { value: 'installed', label: t('settingsOfferedInstalled') },
                { value: 'available', label: t('settingsOfferedStatusAvailable') },
              ]}
              onChange={(value) => setStatusFilter(value as StatusFilter)}
            />
          </HStack>
        }
      />
      {rows.length === 0 ? (
        <Text as="p" type="body" role="status">
          {t('settingsOfferedNoMatches')}
        </Text>
      ) : (
        <Table
          density="compact"
          dividers="rows"
          hasHover
          aria-label={t('settingsOfferedTitle')}
          idKey={(row) => row.id}
          data={rows}
          columns={columns}
          plugins={{ sort: sortPlugin, sticky }}
        />
      )}
      {removing && (
        <AlertDialog
          isOpen
          title={t('settingsOfferedRemoveTitle')}
          description={t('settingsOfferedRemoveConfirm', { name: removing.id })}
          cancelLabel={t('cancel')}
          actionLabel={t('settingsOfferedRemove')}
          actionVariant="destructive"
          isActionLoading={removingBusy}
          onOpenChange={(open) => {
            if (!open && !removingBusy) setRemoving(null);
          }}
          onAction={() => void remove(removing)}
        />
      )}
    </VStack>
  );
}
