import { GENERATED_PUBLISHING_CONFIG } from './config.generated.js';

// One place owns the desktop publishing build configuration: the Meta App ID/broker URL and the
// Google client id are baked in at build time; a dev checkout without them falls back to the
// environment. A missing id is a named failure, never a guessed default.
export interface PublishingConfig {
  metaAppId?: string;
  brokerUrl?: string;
  googleClientId?: string;
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

export function readEnvPublishingConfig(
  env: NodeJS.ProcessEnv = process.env,
): PublishingConfig | null {
  const meta = readMeta(env);
  const googleClientId = env.REUPMATIC_GOOGLE_CLIENT_ID?.trim();
  if (!meta && !googleClientId) return null;
  return {
    ...(meta ? { metaAppId: meta.metaAppId, brokerUrl: meta.brokerUrl } : {}),
    ...(googleClientId ? { googleClientId } : {}),
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
