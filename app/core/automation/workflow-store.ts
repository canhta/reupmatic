import path from 'node:path';
import type { CatalogDatabase } from '../catalog/catalog-database.js';
import { boolean, identifier, identifiers, object, revision, text } from '../catalog/validation.js';
import { validateBatchInput } from '../batch/batch-store.js';
import type { BatchJobInput } from '../batch/batch-types.js';
import { parseProcessingRecipe } from '../processing/recipe.js';
import type { Workflow, WorkflowData, WorkflowRun, WorkflowRunData, WorkflowRunView } from './workflow-types.js';

export class WorkflowStore {
  constructor(private readonly db: CatalogDatabase) {}

  list(): Workflow[] { return this.db.list<WorkflowData>('workflow'); }
  get(id: string): Workflow { return this.db.require<WorkflowData>('workflow', id); }

  save(input: unknown, outputDir: string): Workflow {
    const value = object(input, ['id', 'expected_revision', 'name', 'item_ids', 'processing', 'archived'], ['output_id']);
    if (!path.isAbsolute(outputDir) || outputDir.includes('\0') || outputDir.length > 32768) throw new Error('INVALID_REQUEST');
    const item_ids = identifiers(value.item_ids);
    if (!item_ids.length) throw new Error('WORKFLOW_EMPTY');
    return this.db.save('workflow', identifier(value.id), revision(value.expected_revision), {
      name: text(value.name, 160).trim(), item_ids,
      processing: value.processing === null ? null : parseProcessingRecipe(value.processing),
      output_dir: outputDir, archived: boolean(value.archived),
    });
  }

  findRun(id: string): WorkflowRun | null { return this.db.find<WorkflowRunData>('run', id); }

  runs(): WorkflowRunView[] {
    return this.db.list<WorkflowRunData>('run').map(({ inputs, ...run }) => ({ ...run,
      input_names: inputs.map(input => input.video.name), output_dir: inputs[0]?.output_dir ?? '' }));
  }

  prepare(id: string, workflow: Workflow, inputs: BatchJobInput[]): WorkflowRun {
    const previous = this.findRun(id);
    if (previous) {
      if (previous.workflow_id !== workflow.id) throw new Error('DUPLICATE_REQUEST');
      return previous;
    }
    if (inputs.length !== workflow.item_ids.length
      || inputs.some((input, index) => input.library_id !== workflow.item_ids[index])) throw new Error('INVALID_REQUEST');
    inputs.forEach(validateBatchInput);
    return this.db.save<WorkflowRunData>('run', id, null, {
      workflow_id: workflow.id, workflow_revision: workflow.revision, workflow_name: workflow.name,
      inputs: structuredClone(inputs), job_ids: [], admission: 'prepared',
    });
  }

  admitted(id: string, jobs: string[]): WorkflowRun {
    const current = this.findRun(id);
    if (!current) throw new Error('CATALOG_ITEM_MISSING');
    if (jobs.length !== current.inputs.length) throw new Error('INVALID_WORKER_RESPONSE');
    if (current.admission === 'admitted') {
      if (JSON.stringify(current.job_ids) !== JSON.stringify(jobs)) throw new Error('DUPLICATE_REQUEST');
      return current;
    }
    const { id: _id, revision: rev, created_at: _created, updated_at: _updated, ...data } = current;
    return this.db.save<WorkflowRunData>('run', id, rev, { ...data, job_ids: identifiers(jobs), admission: 'admitted' });
  }
}
