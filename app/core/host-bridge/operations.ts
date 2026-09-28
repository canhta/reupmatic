import type { OperationEntry, Reply } from './operation-contract.js';
import type { operations } from './operation-groups.js';

export type { OperationEntry, Reply } from './operation-contract.js';
export { operation } from './operation-contract.js';
export { operations } from './operation-groups.js';

export type OperationName = keyof typeof operations;
export type OperationRequest<K extends OperationName> = ReturnType<
  (typeof operations)[K]['validate']
>;

type ResultOf<E> =
  E extends OperationEntry<infer _Req, infer Res, infer _Args, string> ? Res : never;
export type OperationResult<K extends OperationName> = ResultOf<(typeof operations)[K]>;

type OperationMethod<E> =
  E extends OperationEntry<infer _Req, infer Res, infer Args, string>
    ? (...args: Args) => Promise<Reply<Res>>
    : never;

export type HostOperationMethods = {
  [K in OperationName as (typeof operations)[K]['rendererMethod']]: OperationMethod<
    (typeof operations)[K]
  >;
};
