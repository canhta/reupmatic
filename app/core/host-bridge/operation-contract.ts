import type { EventName } from './events.js';

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

// biome-ignore lint/correctness/noUnusedVariables: TRes is intentionally phantom.
export interface OperationEntry<TReq, TRes, TArgs extends unknown[], TMethod extends string> {
  readonly rendererMethod: TMethod;
  readonly validate: (input: unknown) => TReq;
  readonly toRequest?: (...args: TArgs) => TReq;
  readonly completesVia?: EventName;
}

export function operation<TReq, TRes>() {
  return <TArgs extends unknown[] = [TReq], TMethod extends string = string>(entry: {
    rendererMethod: TMethod;
    validate: (input: unknown) => TReq;
    toRequest?: (...args: TArgs) => TReq;
    completesVia?: EventName;
  }): OperationEntry<TReq, TRes, TArgs, TMethod> => entry;
}
