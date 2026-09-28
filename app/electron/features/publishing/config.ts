import { GENERATED_PUBLISHING_CONFIG } from './config.generated.js';

// One place owns the desktop publishing build configuration: the Meta App ID/broker URL, the Google
// client id and the TikTok client key/redirect/broker are baked in at build time; a dev checkout
// without them falls back to the environment. A missing value is a named failure, never a guess.
// OPEN ITEM (ADR 0001): the TikTok desktop redirect URI form is not verified in the developer
// portal; the operator supplies the registered value.
export interface PublishingConfig {
  metaAppId?: string;
  brokerUrl?: string;
  googleClientId?: string;
  tiktokClientKey?: string;
  tiktokRedirectUri?: string;
  tiktokBrokerUrl?: string;
}

function readMeta(env: NodeJS.ProcessEnv): { metaAppId: string; brokerUrl: string } | null {
  const metaAppId = env.REUPMATIC_META_APP_ID?.trim();
  const broker = env.REUPMATIC_META_BROKER_URL?.trim();
  if (!metaAppId || !broker) return null;
  try {
    const url = new URL(broker);
    if (url.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { metaAppId, brokerUrl: broker.replace(/\/$/, '') };
}

function readTikTok(
  env: NodeJS.ProcessEnv,
): { tiktokClientKey: string; tiktokRedirectUri: string; tiktokBrokerUrl: string } | null {
  const tiktokClientKey = env.REUPMATIC_TIKTOK_CLIENT_KEY?.trim();
  const tiktokRedirectUri = env.REUPMATIC_TIKTOK_REDIRECT_URI?.trim();
  const broker = env.REUPMATIC_TIKTOK_BROKER_URL?.trim();
  if (!tiktokClientKey || !tiktokRedirectUri || !broker) return null;
  try {
    if (new URL(broker).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { tiktokClientKey, tiktokRedirectUri, tiktokBrokerUrl: broker.replace(/\/$/, '') };
}

export function readEnvPublishingConfig(
  env: NodeJS.ProcessEnv = process.env,
): PublishingConfig | null {
  const meta = readMeta(env);
  const googleClientId = env.REUPMATIC_GOOGLE_CLIENT_ID?.trim();
  const tiktok = readTikTok(env);
  if (!meta && !googleClientId && !tiktok) return null;
  return {
    ...(meta ? { metaAppId: meta.metaAppId, brokerUrl: meta.brokerUrl } : {}),
    ...(googleClientId ? { googleClientId } : {}),
    ...(tiktok ?? {}),
  };
}

export function readPublishingConfig(
  env: NodeJS.ProcessEnv = process.env,
): PublishingConfig | null {
  return GENERATED_PUBLISHING_CONFIG ?? readEnvPublishingConfig(env);
}

export function requireGoogleClientId(config: PublishingConfig | null): string {
  const value = config?.googleClientId?.trim();
  if (!value) throw new Error('PUBLISH_CONFIG_MISSING');
  return value;
}

export function requireMeta(config: PublishingConfig | null): {
  metaAppId: string;
  brokerUrl: string;
} {
  const metaAppId = config?.metaAppId?.trim();
  const brokerUrl = config?.brokerUrl?.trim();
  if (!metaAppId || !brokerUrl) throw new Error('PUBLISHING_NOT_CONFIGURED');
  return { metaAppId, brokerUrl };
}

export function requireTikTok(config: PublishingConfig | null): {
  clientKey: string;
  redirectUri: string;
  brokerUrl: string;
} {
  const clientKey = config?.tiktokClientKey?.trim();
  const redirectUri = config?.tiktokRedirectUri?.trim();
  const brokerUrl = config?.tiktokBrokerUrl?.trim();
  if (!clientKey || !redirectUri || !brokerUrl) throw new Error('PUBLISHING_NOT_CONFIGURED');
  return { clientKey, redirectUri, brokerUrl };
}
