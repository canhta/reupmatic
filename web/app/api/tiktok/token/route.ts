import { NextResponse } from 'next/server';
import { brokerConfigFromEnv, exchangeTikTokCode, refreshTikTokToken } from '@/lib/tiktok-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stateless: exchanges a login code (PKCE code_verifier) or refreshes a token, and returns the
// token set once. It stores nothing, logs no token, and accepts only the registered redirect URI.
export async function POST(request: Request) {
  const config = brokerConfigFromEnv(process.env);
  if (!config) return NextResponse.json({ error: 'BROKER_NOT_CONFIGURED' }, { status: 500 });

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const action =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).action
      : undefined;
  const result =
    action === 'refresh'
      ? await refreshTikTokToken(body, config)
      : await exchangeTikTokCode(body, config);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ tokens: result.tokens }, { headers: { 'Cache-Control': 'no-store' } });
}
