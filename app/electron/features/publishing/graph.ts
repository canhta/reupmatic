export interface GraphErrorBody {
  error?: {
    code?: unknown;
    error_subcode?: unknown;
    message?: unknown;
    type?: unknown;
  };
}

// Meta error codes that prove the platform refused the call and created nothing. Anything else
// after a finish call (5xx, gateway/timeout, unparseable body, an unmapped code) is ambiguous.
const DEFINITE_REFUSAL = new Set([100, 190, 200, 32, 613, 80001]);

export function mapGraphError(error: GraphErrorBody['error']): string {
  const code = Number(error?.code);
  if (code === 190) return 'CHANNEL_REAUTHORIZE';
  if (code === 32 || code === 613 || code === 80001) return 'PUBLISH_RATE_LIMITED';
  if (code === 100) return 'PUBLISH_INVALID_REQUEST';
  if (code === 200) return 'PUBLISH_PERMISSION_DENIED';
  return 'PUBLISH_FAILED';
}

export interface GraphFailure {
  code: number;
  named: string;
  definite: boolean;
}

export async function parseGraphFailure(response: Response): Promise<GraphFailure> {
  const body = (await response.json().catch(() => null)) as GraphErrorBody | null;
  const code = Number(body?.error?.code);
  return {
    code: Number.isFinite(code) ? code : 0,
    named: mapGraphError(body?.error),
    definite: DEFINITE_REFUSAL.has(code),
  };
}

export async function readGraphError(response: Response): Promise<string> {
  return (await parseGraphFailure(response)).named;
}
