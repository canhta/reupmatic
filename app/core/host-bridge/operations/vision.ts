import { type ModelStatus, parseVisionInput, type VisionInput } from '../../vision/vision.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

export const visionOperations = {
  'vision-status': operation<undefined, ModelStatus>()({
    rendererMethod: 'visionStatus',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'vision-start': operation<VisionInput, { request_id: string; revision: number }>()({
    rendererMethod: 'visionStart',
    validate: (input) => parseVisionInput(input),
    completesVia: 'vision-job',
  }),
  'vision-cancel': operation<{ request_id: string }, { requested: boolean }>()({
    rendererMethod: 'visionCancel',
    validate: (input) => ({
      request_id: requestId(requestRecord(input, ['request_id']).request_id),
    }),
    toRequest: (id: string) => ({ request_id: id }),
  }),
} as const;
