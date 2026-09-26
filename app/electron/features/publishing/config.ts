// One place owns the desktop publishing build configuration. With nothing configured, connecting a
// channel fails loudly with PUBLISHING_NOT_CONFIGURED rather than guessing an app or broker.
export interface PublishingConfig {
  metaAppId: string;
  brokerUrl: string;
}

export function readPublishingConfig(
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
