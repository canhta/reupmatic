import type { operations } from './operation-groups.js';

/** The sole registry interface consumed by `WorkerClient`. */
export type { OperationEntry, OperationKind } from './operation-contract.js';
export { operations } from './operation-groups.js';

export type OperationName = keyof typeof operations;
export type OperationResult<M extends OperationName> = ReturnType<
  (typeof operations)[M]['validate']
>;
