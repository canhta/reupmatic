import type { SaveWorkflow, Workflow } from '../../automation/workflow-contracts.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord, requestRevision } from '../validators.js';

export const automationOperations = {
  'workflow-pick-output': operation<undefined, { output_id: string; name: string } | null>()({
    rendererMethod: 'workflowPickOutput',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'workflow-save': operation<SaveWorkflow, Workflow>()({
    rendererMethod: 'workflowSave',
    validate: (input) => {
      const value = requestRecord(input, [
        'id',
        'expected_revision',
        'name',
        'item_ids',
        'processing',
        'output_id',
        'archived',
      ]);
      requestId(value.id);
      if (value.output_id !== undefined) requestId(value.output_id);
      if (!Array.isArray(value.item_ids) || value.item_ids.length > 100)
        throw new Error('INVALID_REQUEST');
      for (const itemId of value.item_ids) requestId(itemId);
      return input as SaveWorkflow;
    },
  }),
  'workflow-run': operation<
    { workflow_id: string; expected_revision: number; request_id: string },
    { id: string }
  >()({
    rendererMethod: 'workflowRun',
    validate: (input) => {
      const value = requestRecord(input, ['workflow_id', 'expected_revision', 'request_id']);
      return {
        workflow_id: requestId(value.workflow_id),
        expected_revision: requestRevision(value.expected_revision),
        request_id: requestId(value.request_id),
      };
    },
  }),
} as const;
