export interface GraphErrorBody {
  error?: {
    code?: unknown;
    error_subcode?: unknown;
    message?: unknown;
    type?: unknown;
  };
}

// Meta's own error codes (ADR 0001): token expiry, throttling, invalid parameters, permissions.
export function mapGraphError(error: GraphErrorBody['error']): string {
  const code = Number(error?.code);
  if (code === 190) return 'CHANNEL_REAUTHORIZE';
  if (code === 32 || code === 613 || code === 80001) return 'PUBLISH_RATE_LIMITED';
  if (code === 100) return 'PUBLISH_INVALID_REQUEST';
  if (code === 200) return 'PUBLISH_PERMISSION_DENIED';
  return 'PUBLISH_FAILED';
}

export async function readGraphError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as GraphErrorBody | null;
  return mapGraphError(body?.error);
}
