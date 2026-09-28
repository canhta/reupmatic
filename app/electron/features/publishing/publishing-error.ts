export interface CodedError extends Error {
  code: string;
  /**
   * True only for a definite platform refusal (a mapped 4xx) after the create call could have
   * landed. Ambiguous failures (5xx, timeout, unparseable body, unmapped code) stay false and are
   * reconciled, never marked failed.
   */
  definite: boolean;
}

export function errorCodeOf(error: unknown): string {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string')
    return error.code;
  return error instanceof Error && /^[A-Z_]+$/.test(error.message)
    ? error.message
    : 'PUBLISH_FAILED';
}

/** Named publishing failure; the code is the only thing that crosses IPC. */
export function publishError(code: string, options: { definite?: boolean } = {}): CodedError {
  const error = new Error(code) as CodedError;
  error.code = code;
  error.definite = options.definite ?? false;
  return error;
}

export function isDefiniteRefusal(error: unknown): error is CodedError {
  return error instanceof Error && 'definite' in error && (error as CodedError).definite === true;
}
