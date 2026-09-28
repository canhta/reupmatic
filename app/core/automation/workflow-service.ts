import type { BatchJobInput } from '../batch/batch-contracts.js';
import type { BatchQueue } from '../batch/batch-queue.js';
import { identifier } from '../catalog/validation.js';
import type { VideoSource } from '../media/media-contracts.js';
import type { ModelFingerprints, ProcessingRecipe } from '../processing/recipe.js';
import type { Workflow, WorkflowRun } from './workflow-contracts.js';

interface Host {
  queue: Pick<BatchQueue, 'enqueue' | 'snapshot'>;
  resolveLibrary(id: string): Promise<VideoSource>;
  resolveModels(recipe: ProcessingRecipe): Promise<ModelFingerprints>;
  checkOutput(directory: string): Promise<void>;
}

export interface WorkflowLedger {
  getWorkflow(id: string): Workflow;
  findWorkflowRun(id: string): WorkflowRun | null;
  prepareWorkflowRun(id: string, workflow: Workflow, inputs: BatchJobInput[]): WorkflowRun;
  admitWorkflowRun(id: string, jobs: string[]): WorkflowRun;
}

export class WorkflowService {
  private pending = new Map<string, { workflowId: string; promise: Promise<WorkflowRun> }>();
  private closing = false;

  constructor(
    private readonly store: WorkflowLedger,
    private readonly host: Host,
  ) {}
  get activeCount(): number {
    return this.pending.size;
  }

  run(workflowId: string, expectedRevision: number, requestId: string): Promise<WorkflowRun> {
    identifier(workflowId);
    identifier(requestId);
    if (this.closing) return Promise.reject(new Error('APP_CLOSING'));
    const active = this.pending.get(requestId);
    if (active)
      return active.workflowId === workflowId
        ? active.promise
        : Promise.reject(new Error('DUPLICATE_REQUEST'));
    const promise = this.prepareAndAdmit(workflowId, expectedRevision, requestId).finally(() =>
      this.pending.delete(requestId),
    );
    this.pending.set(requestId, { workflowId, promise });
    return promise;
  }

  private async prepareAndAdmit(
    workflowId: string,
    expectedRevision: number,
    requestId: string,
  ): Promise<WorkflowRun> {
    const existing = this.store.findWorkflowRun(requestId);
    if (existing) {
      if (existing.workflow_id !== workflowId) throw new Error('DUPLICATE_REQUEST');
      return this.admit(existing);
    }
    const workflow = this.store.getWorkflow(workflowId);
    if (workflow.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
    if (workflow.archived) throw new Error('WORKFLOW_ARCHIVED');
    await this.host.checkOutput(workflow.output_dir);
    const processingExtra = workflow.processing
      ? {
          processing: workflow.processing,
          processing_models: await this.host.resolveModels(workflow.processing),
        }
      : undefined;
    const inputs: BatchJobInput[] = [];
    for (const id of workflow.item_ids) {
      if (this.closing) throw new Error('APP_CLOSING');
      const video = await this.host.resolveLibrary(id);
      inputs.push({
        video: { path: video.path, name: video.name, sha256: video.sha256 },
        library_id: id,
        output_dir: workflow.output_dir,
        encoding: 'review',
        ...processingExtra,
      });
    }
    if (this.closing) throw new Error('APP_CLOSING');
    if (this.store.getWorkflow(workflowId).revision !== expectedRevision)
      throw new Error('REVISION_CONFLICT');
    return this.admit(this.store.prepareWorkflowRun(requestId, workflow, inputs));
  }

  private admit(run: WorkflowRun): WorkflowRun {
    if (run.admission === 'admitted') return run;
    if (this.closing) throw new Error('APP_CLOSING');
    const snapshot = this.host.queue.enqueue(run.id, run.inputs);
    const ids = snapshot.items.filter((job) => job.batch_id === run.id).map((job) => job.id);
    return this.store.admitWorkflowRun(run.id, ids);
  }

  async close(): Promise<void> {
    this.closing = true;
    await Promise.allSettled([...this.pending.values()].map((value) => value.promise));
  }
}
