export type OperationKind = 'instant' | 'queued';

export interface OperationEntry<T = Record<string, unknown>> {
  readonly method: string;
  readonly kind: OperationKind;
  validate(data: unknown): T;
}
