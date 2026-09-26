import { NextResponse } from 'next/server';
import { brokerConfigFromEnv, exchangeFacebookCode } from '@/lib/facebook-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stateless: exchanges the login code for a long-lived user token and returns it once. It stores
// nothing, logs no token, and accepts only the registered redirect URI.
export async function POST(request: Request) {
  const config = brokerConfigFromEnv(process.env);
  if (!config) return NextResponse.json({ error: 'BROKER_NOT_CONFIGURED' }, { status: 500 });

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const result = await exchangeFacebookCode(body, config);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(
    { access_token: result.access_token },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
