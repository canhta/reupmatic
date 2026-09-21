import type { EventName } from './events.js';

/**
 * The one reply envelope every operation's host adapter returns and every renderer call unwraps.
 * `runtime/ipc.ts`'s wire wrapper and `app/ui/bridge/client.ts`'s `unwrap` both target this shape.
 */
export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * One renderer-initiated request/reply verb crossing the Electron boundary.
 * `TArgs` is the renderer call's own parameter list; when it differs from a single `TReq` object,
 * `toRequest` maps it onto the wire shape `validate` expects. `completesVia` names the event
 * channel that carries a job-shaped operation's terminal outcome.
 */
// `TRes` is a phantom type parameter carried by the generic instantiation and recovered by the
// facade's conditional types.
// biome-ignore lint/correctness/noUnusedVariables: TRes is intentionally phantom.
export interface OperationEntry<TReq, TRes, TArgs extends unknown[], TMethod extends string> {
  readonly rendererMethod: TMethod;
  readonly validate: (input: unknown) => TReq;
  readonly toRequest?: (...args: TArgs) => TReq;
  readonly completesVia?: EventName;
}

// Curried so request/result types can be explicit while arguments and renderer method stay
// inferred from the entry.
export function operation<TReq, TRes>() {
  return <TArgs extends unknown[] = [TReq], TMethod extends string = string>(entry: {
    rendererMethod: TMethod;
    validate: (input: unknown) => TReq;
    toRequest?: (...args: TArgs) => TReq;
    completesVia?: EventName;
  }): OperationEntry<TReq, TRes, TArgs, TMethod> => entry;
}
