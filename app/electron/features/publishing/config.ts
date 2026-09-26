import { GENERATED_PUBLISHING_CONFIG } from './config.generated.js';

// One place owns the desktop publishing build configuration: the Meta App ID and broker URL are
// baked in at build time, and a dev checkout without them falls back to the environment.
export interface PublishingConfig {
  metaAppId: string;
  brokerUrl: string;
}

export function readEnvPublishingConfig(
  env: NodeJS.ProcessEnv = process.env,
): PublishingConfig | null {
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

export function readPublishingConfig(
  env: NodeJS.ProcessEnv = process.env,
): PublishingConfig | null {
  return GENERATED_PUBLISHING_CONFIG ?? readEnvPublishingConfig(env);
}
