import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { workflowRunState } from '../../../core/automation/run-state';
import type { Workflow } from '../../../core/automation/workflow-contracts';
import type { BatchItemView } from '../../../core/batch/batch-contracts';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { registerMenuCommand } from '../../shell/menuCommands';
import { useCatalog } from '../catalog/CatalogProvider';
import { useRecordDraft } from '../catalog/useRecordDraft';
import type { WorkflowDraft } from './WorkflowEditor';
import { WorkflowEditor } from './WorkflowEditor';
import { WorkflowList } from './WorkflowList';

function draftOf(workflow?: Workflow): WorkflowDraft {
  return {
    id: workflow?.id ?? crypto.randomUUID(),
    expected_revision: workflow?.revision ?? null,
    name: workflow?.name ?? '',
    item_ids: workflow?.item_ids ?? [],
    processing: structuredClone(workflow?.processing ?? null),
    archived: workflow?.archived ?? false,
    output_name: workflow?.output_dir ?? '',
  };
}

export function WorkflowManager({
  queuePaused,
  jobs,
  onRun,
}: {
  queuePaused: boolean;
  jobs: BatchItemView[];
  onRun(id: string): void;
}) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const confirm = useConfirmation();
  const draft = useRecordDraft(draftOf);
  const requests = useRef(new Map<string, { revision: number; id: string }>());
  const focusReturn = useRef<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const { value } = draft;
  const disabled = catalog.busy || !catalog.snapshot;
  const workflows = catalog.snapshot?.workflows ?? [];
  const runs = catalog.snapshot?.runs ?? [];
  const executionAvailable = Boolean(catalog.snapshot?.execution_available);

  function lastRunOutcome(workflowId: string) {
    const latest = runs
      .filter((run) => run.workflow_id === workflowId)
      .sort((a, b) => b.created_at - a.created_at)[0];
    return latest ? t(`workflowRun_${workflowRunState(latest, jobs)}`) : t('workflowNoRuns');
  }

  function openEditor(initial: WorkflowDraft, focusTarget: string) {
    focusReturn.current = focusTarget;
    setStep(0);
    setSaved(false);
    void draft.choose(initial).then((opened) => {
      if (opened) setEditing(true);
    });
  }

  async function closeEditor() {
    if (!(await draft.discard())) return;
    setEditing(false);
  }

  useEffect(() => {
    if (editing) return;
    const target = focusReturn.current;
    focusReturn.current = null;
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-workflow-focus="${target}"]`)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  useEffect(
    () =>
      registerMenuCommand('automation.newWorkflow', () => {
        if (disabled) return;
        focusReturn.current = 'create';
        setStep(0);
        setSaved(false);
        void draft.choose(draftOf()).then((opened) => {
          if (opened) setEditing(true);
        });
      }),
    [disabled, draft],
  );

  async function pickOutput() {
    const picked = await catalog.mutate(() => window.reupmatic.workflowPickOutput());
    if (picked)
      draft.setValue((current) => ({
        ...current,
        output_id: picked.output_id,
        output_name: picked.name,
      }));
  }

  async function save() {
    const { output_name: _name, ...input } = value;
    const result = await catalog.mutate(() => window.reupmatic.workflowSave(input));
    if (result) {
      draft.replace(draftOf(result));
      setSaved(true);
    }
  }

  async function run(workflow: Workflow) {
    if (
      !(await confirm(
        t(queuePaused ? 'workflowQueueConfirm' : 'workflowQueueLiveConfirm', {
          name: workflow.name,
        }),
      ))
    )
      return;
    const prior = requests.current.get(workflow.id);
    const request =
      prior?.revision === workflow.revision
        ? prior
        : { revision: workflow.revision, id: crypto.randomUUID() };
    requests.current.set(workflow.id, request);
    const result = await catalog.mutate(() =>
      window.reupmatic.workflowRun({
        workflow_id: workflow.id,
        expected_revision: workflow.revision,
        request_id: request.id,
      }),
    );
    if (result) {
      requests.current.delete(workflow.id);
      onRun(result.id);
    }
  }

  if (editing) {
    return (
      <WorkflowEditor
        title={t(value.expected_revision ? 'workflowEdit' : 'workflowNewTitle')}
        value={value}
        disabled={disabled}
        dirty={draft.dirty}
        step={step}
        onStep={setStep}
        onChange={draft.setValue}
        onPickOutput={() => void pickOutput()}
        onSave={() => void save()}
        onReset={() => void draft.reset()}
        onBack={() => void closeEditor()}
        saved={saved}
      />
    );
  }

  return (
    <WorkflowList
      workflows={workflows}
      disabled={disabled}
      executionAvailable={executionAvailable}
      lastRunOutcome={lastRunOutcome}
      onCreate={() => openEditor(draftOf(), 'create')}
      onEdit={(workflow) => openEditor(draftOf(workflow), `edit-${workflow.id}`)}
      onRun={(workflow) => void run(workflow)}
    />
  );
}
