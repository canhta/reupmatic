import type { BatchItemView } from '../batch/batch-contracts.js';
import type { RunState, WorkflowRunView } from './workflow-contracts.js';

export function workflowRunState(run: WorkflowRunView, jobs: BatchItemView[]): RunState {
  if (run.admission === 'prepared') return 'prepared';
  const states = run.job_ids.map((id) => jobs.find((job) => job.id === id)?.state);
  if (!states.length || states.some((state) => state === undefined)) return 'interrupted';
  if (states.some((state) => state === 'running' || state === 'cancelling')) return 'running';
  if (states.some((state) => state === 'queued')) return 'queued';
  if (states.some((state) => state === 'interrupted')) return 'interrupted';
  if (states.every((state) => state === 'complete')) return 'complete';
  if (states.every((state) => state === 'cancelled')) return 'cancelled';
  if (states.every((state) => state === 'failed')) return 'failed';
  return 'partial';
}
