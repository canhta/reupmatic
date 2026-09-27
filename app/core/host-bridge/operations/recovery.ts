import type {
  RecoveryIdentity,
  RecoveryOpened,
  RecoverySave,
  RecoverySummary,
} from '../../projects/recovery/recovery-contracts.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord, requestRevision } from '../validators.js';

export const recoveryOperations = {
  'recovery-list': operation<undefined, RecoverySummary[]>()({
    rendererMethod: 'recoveryList',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'recovery-save': operation<RecoverySave, { revision: number; updated_at: number }>()({
    rendererMethod: 'recoverySave',
    validate: (input) => {
      const value = requestRecord(input, [
        'id',
        'expected_revision',
        'asset_id',
        'snapshot',
        'project_path',
        'source_id',
      ]);
      if (
        value.project_path !== undefined &&
        (typeof value.project_path !== 'string' ||
          !value.project_path ||
          value.project_path.length > 4096 ||
          value.project_path.includes('\0'))
      ) {
        throw new Error('INVALID_REQUEST');
      }
      return {
        id: requestId(value.id),
        expected_revision: requestRevision(value.expected_revision),
        asset_id: requestId(value.asset_id),
        snapshot: value.snapshot as RecoverySave['snapshot'],
        ...(value.project_path === undefined ? {} : { project_path: value.project_path }),
        ...(value.source_id === undefined ? {} : { source_id: requestId(value.source_id) }),
      };
    },
  }),
  'recovery-open': operation<RecoveryIdentity, RecoveryOpened | null>()({
    rendererMethod: 'recoveryOpen',
    validate: (input) => {
      const value = requestRecord(input, ['id', 'expected_revision']);
      return {
        id: requestId(value.id),
        expected_revision: requestRevision(value.expected_revision),
      };
    },
  }),
  'recovery-discard': operation<RecoveryIdentity, { removed: boolean }>()({
    rendererMethod: 'recoveryDiscard',
    validate: (input) => {
      const value = requestRecord(input, ['id', 'expected_revision']);
      return {
        id: requestId(value.id),
        expected_revision: requestRevision(value.expected_revision),
      };
    },
  }),
  'recovery-flush-result': operation<
    { request_id: string; saved: boolean },
    { accepted: boolean }
  >()({
    rendererMethod: 'recoveryFlushResult',
    validate: (input) => {
      const value = requestRecord(input, ['request_id', 'saved']);
      if (typeof value.saved !== 'boolean') throw new Error('INVALID_REQUEST');
      return { request_id: requestId(value.request_id), saved: value.saved };
    },
    toRequest: (request_id: string, saved: boolean) => ({ request_id, saved }),
  }),
} as const;
