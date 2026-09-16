import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Workflow, SaveWorkflow } from '../../../core/automation/workflow-types';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { useCatalog } from '../catalog/CatalogProvider';
import { useRecordDraft } from '../catalog/useRecordDraft';
import { ProcessingOptions } from '../processing/ProcessingOptions';
import { ProfilePicker } from '../profiles/ProfilePicker';
import { WorkflowInputPicker } from './WorkflowInputPicker';

type WorkflowDraft = SaveWorkflow & { output_name: string };
function draftOf(workflow?: Workflow): WorkflowDraft {
  return {
    id: workflow?.id ?? crypto.randomUUID(), expected_revision: workflow?.revision ?? null,
    name: workflow?.name ?? '', item_ids: workflow?.item_ids ?? [],
    processing: structuredClone(workflow?.processing ?? null), archived: workflow?.archived ?? false,
    output_name: workflow?.output_dir ?? '',
  };
}

export function WorkflowManager({ queuePaused, onRun }: { queuePaused: boolean; onRun(id: string): void }) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const confirm = useConfirmation();
  const draft = useRecordDraft(draftOf);
  const requests = useRef(new Map<string, { revision: number; id: string }>());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [saved, setSaved] = useState(false);
  const { value } = draft;
  const disabled = catalog.busy || !catalog.snapshot;
  const workflows = (catalog.snapshot?.workflows ?? []).filter(item => item.name.toLowerCase().includes(search.toLowerCase()));
  const offset = Math.min(page * 25, Math.max(0, Math.ceil(workflows.length / 25) - 1) * 25);

  async function pickOutput() {
    const picked = await catalog.mutate(() => window.reupmatic.workflowPickOutput());
    if (picked) draft.setValue(current => ({ ...current, output_id: picked.output_id, output_name: picked.name }));
  }

  async function save() {
    const { output_name: _name, ...input } = value;
    const result = await catalog.mutate(() => window.reupmatic.workflowSave(input));
    if (result) { draft.replace(draftOf(result)); setSaved(true); }
  }

  async function run(workflow: Workflow) {
    if (!await confirm(t(queuePaused ? 'workflowQueueConfirm' : 'workflowQueueLiveConfirm', { name: workflow.name }))) return;
    const prior = requests.current.get(workflow.id);
    const request = prior?.revision === workflow.revision ? prior : { revision: workflow.revision, id: crypto.randomUUID() };
    requests.current.set(workflow.id, request);
    const result = await catalog.mutate(() => window.reupmatic.workflowRun({
      workflow_id: workflow.id, expected_revision: workflow.revision, request_id: request.id,
    }));
    if (result) { requests.current.delete(workflow.id); onRun(result.id); }
  }

  return <div className="business-workspace">
    <Banner status="info" title={t('workflowScope')} description={t('workflowScopeHelp')} />
    {!catalog.snapshot?.execution_available && <p>{t('workflowExecutionUnavailable')}</p>}
    <div className="business-grid">
      <div className="business-list">
        <div className="business-toolbar">
          <TextInput label={t('catalogSearch')} value={search} onChange={text => { setSearch(text); setPage(0); }} />
          <Button label={t('workflowNew')} isDisabled={disabled} onClick={() => void draft.choose(draftOf())} />
        </div>
        {!workflows.length ? <EmptyState title={t('workflowsEmpty')} description={t('workflowsEmptyHelp')} /> :
          <div className="business-table"><Table density="compact" aria-label={t('workflowsTitle')}>
            <TableHeader><TableRow>
              <TableHeaderCell scope="col">{t('catalogName')}</TableHeaderCell>
              <TableHeaderCell scope="col">{t('workflowInputs')}</TableHeaderCell>
              <TableHeaderCell scope="col">{t('catalogActions')}</TableHeaderCell>
            </TableRow></TableHeader>
            <TableBody>{workflows.slice(offset, offset + 25).map(workflow => <TableRow key={workflow.id}>
              <TableCell>{workflow.name}{workflow.archived && <p>{t('catalogArchived')}</p>}</TableCell>
              <TableCell>{workflow.item_ids.length}</TableCell>
              <TableCell><div className="action-row">
                <Button label={t('catalogEdit')} isDisabled={disabled} onClick={() => void draft.choose(draftOf(workflow))} />
                <Button label={t('workflowQueue')} isDisabled={disabled || workflow.archived || !catalog.snapshot?.execution_available}
                  onClick={() => void run(workflow)} />
              </div></TableCell>
            </TableRow>)}</TableBody>
          </Table></div>}
        <div className="business-pagination">
          <span>{t('catalogCount', { count: workflows.length })}</span>
          <Button label={t('libraryPrevious')} isDisabled={!offset} onClick={() => setPage(Math.max(0, page - 1))} />
          <Button label={t('libraryNext')} isDisabled={offset + 25 >= workflows.length} onClick={() => setPage(page + 1)} />
        </div>
      </div>
      <div className="business-form">
        <h2>{t(value.expected_revision ? 'workflowEdit' : 'workflowNew')}</h2>
        <TextInput label={t('catalogName')} value={value.name} isDisabled={disabled}
          onChange={name => draft.setValue({ ...value, name })} />
        <WorkflowInputPicker value={value.item_ids} disabled={disabled}
          onChange={item_ids => draft.setValue({ ...value, item_ids })} />
        <ProfilePicker disabled={disabled}
          onApply={processing => draft.setValue({ ...value, processing: processing ?? null })} />
        <ProcessingOptions value={value.processing ?? undefined} disabled={disabled}
          onChange={processing => draft.setValue({ ...value, processing: processing ?? null })} />
        <p className="business-path">{value.output_name || t('batchNoFolder')}</p>
        <Button label={t('batchChooseFolder')} isDisabled={disabled} onClick={() => void pickOutput()} />
        <CheckboxInput label={t('catalogArchive')} value={value.archived} isDisabled={disabled}
          onChange={archived => draft.setValue({ ...value, archived })} />
        <p className="field-help">{t('workflowSaveHelp')}</p>
        <div className="action-row">
          <Button label={t('catalogSave')} variant="primary"
            isDisabled={disabled || !value.name.trim() || !value.item_ids.length || !value.output_name
              || (!draft.dirty && value.expected_revision !== null)} onClick={() => void save()} />
          <Button label={t('catalogReset')} isDisabled={disabled || !draft.dirty} onClick={() => void draft.reset()} />
          {draft.dirty && <span>{t('catalogUnsaved')}</span>}
        </div>
        {saved && !draft.dirty && <p role="status">{t('workflowSaved')}</p>}
      </div>
    </div>
  </div>;
}
