import type { operations } from './operation-groups.js';

/**
 * Canonical host-to-worker operation identity and baseline reply validation. Capability modules
 * own the entries; this facade is the sole registry interface consumed by `WorkerClient`.
 * Method identity mirrors the schema-generated Python registry, while each hand-authored `kind`
 * records whether the worker answers inline or through its job queue.
 */
export type { OperationEntry, OperationKind } from './operation-contract.js';
export { operations } from './operation-groups.js';

export type OperationName = keyof typeof operations;
export type OperationResult<M extends OperationName> = ReturnType<
  (typeof operations)[M]['validate']
>;
