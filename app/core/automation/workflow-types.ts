import type { BatchJobInput } from '../batch/batch-types.js';
import type { MutationIdentity, RecordMeta } from '../catalog/catalog-types.js';
import type { ProcessingRecipe } from '../processing/recipe.js';
export interface WorkflowData {
  name: string;
  item_ids: string[];
  processing: ProcessingRecipe | null;
  output_dir: string;
  archived: boolean;
}
export type Workflow = WorkflowData & RecordMeta;
export interface SaveWorkflow extends MutationIdentity {
  name: string;
  item_ids: string[];
  processing: ProcessingRecipe | null;
  output_id?: string;
  archived: boolean;
}
export interface WorkflowRunData {
  workflow_id: string;
  workflow_revision: number;
  workflow_name: string;
  inputs: BatchJobInput[];
  job_ids: string[];
  admission: 'prepared' | 'admitted';
}
export type WorkflowRun = WorkflowRunData & RecordMeta;
export type WorkflowRunView = Omit<WorkflowRun, 'inputs'> & {
  input_names: string[];
  output_dir: string;
};
export type RunState =
  | 'prepared'
  | 'queued'
  | 'running'
  | 'interrupted'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'partial';
