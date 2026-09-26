import { randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import type { Post } from '../../../core/distribution/distribution-contracts.js';
import type {
  Publication,
  PublicationMedia,
} from '../../../core/distribution/publishing/contracts.js';
import { facebookPreflight } from '../../../core/distribution/publishing/facebook.js';
import type { IpcWire } from '../../runtime/ipc.js';
import type { PublishingConfig } from './config.js';
import type { ChannelCredentialStore } from './credential-store.js';
import { DEFAULT_GRAPH_BASE_URL, DEFAULT_UPLOAD_BASE_URL } from './facebook-adapter.js';
import {
  type ConnectedPage,
  DEFAULT_OAUTH_BASE_URL,
  exchangeCodeForUserToken,
  listPages,
} from './oauth.js';
import { openFacebookLogin } from './oauth-window.js';
import { PublishRunner } from './publish-runner.js';

export interface PublishingHost {
  wire: IpcWire;
  credentials: ChannelCredentialStore;
  getPost(id: string): Post;
  setPublication(id: string, publication: Publication): Post;
  getWindow(): BrowserWindow | undefined;
  probeMedia(path: string): Promise<PublicationMedia>;
  changed(): void;
  config: PublishingConfig | null;
  graphBaseUrl?: string;
  uploadBaseUrl?: string;
  oauthBaseUrl?: string;
  fetch?: typeof fetch;
}

function namedCode(error: unknown): string {
  return error instanceof Error && /^[A-Z_]+$/.test(error.message)
    ? error.message
    : 'PUBLISH_FAILED';
}

export function installPublishing(host: PublishingHost) {
  const pending = new Map<string, { pages: ConnectedPage[] }>();
  const runner = new PublishRunner({
    graphBaseUrl: host.graphBaseUrl ?? DEFAULT_GRAPH_BASE_URL,
    uploadBaseUrl: host.uploadBaseUrl ?? DEFAULT_UPLOAD_BASE_URL,
    fetch: host.fetch,
  });

  function requireConfig(): PublishingConfig {
    if (!host.config) throw new Error('PUBLISHING_NOT_CONFIGURED');
    return host.config;
  }
  function facebookPost(id: string): Post {
    const post = host.getPost(id);
    if (post.channel.platform !== 'facebook_page') throw new Error('PUBLISH_PLATFORM_UNSUPPORTED');
    return post;
  }
  function send(channel: string, message: unknown): void {
    const window = host.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(`reupmatic:${channel}`, message);
  }
  async function markReauthorizeIfNeeded(post: Post, code: string): Promise<void> {
    if (code === 'CHANNEL_REAUTHORIZE') await host.credentials.markReauthorize(post.channel.id);
  }

  host.wire('channel-connect-start', async (input) => {
    const config = requireConfig();
    const window = host.getWindow();
    if (!window) throw new Error('WINDOW_UNAVAILABLE');
    const code = await openFacebookLogin(window, {
      appId: config.metaAppId,
      oauthBaseUrl: host.oauthBaseUrl ?? DEFAULT_OAUTH_BASE_URL,
    });
    const userToken = await exchangeCodeForUserToken(code, config.brokerUrl, host.fetch);
    const pages = await listPages(userToken, host.graphBaseUrl, host.fetch);
    if (!pages.length) throw new Error('CHANNEL_NO_PAGES');
    pending.set(input.id, { pages });
    return { pages: pages.map(({ id, name }) => ({ id, name })) };
  });

  host.wire('channel-connect-page', async (input) => {
    const entry = pending.get(input.id);
    if (!entry) throw new Error('CHANNEL_AUTHORIZE_EXPIRED');
    const page = entry.pages.find((candidate) => candidate.id === input.page_id);
    if (!page) throw new Error('INVALID_REQUEST');
    await host.credentials.save(input.id, {
      account_id: page.id,
      account_name: page.name,
      access_token: page.access_token,
    });
    pending.delete(input.id);
    host.changed();
    return { account_name: page.name };
  });

  host.wire('channel-disconnect', async (input) => {
    await host.credentials.remove(input.id);
    pending.delete(input.id);
    host.changed();
    return { disconnected: true };
  });

  host.wire('post-preflight', async (input) => {
    const post = facebookPost(input.id);
    const media = await host.probeMedia(post.export.path);
    return facebookPreflight(post, media, Date.now());
  });

  host.wire('post-publish', async (input) => {
    const post = facebookPost(input.id);
    const credentials = await host.credentials.credentials(post.channel.id);
    if (!credentials) throw new Error('CHANNEL_NOT_CONNECTED');
    const media = await host.probeMedia(post.export.path);
    const blocking = facebookPreflight(post, media, Date.now()).filter(
      (problem) => problem.severity === 'blocking',
    );
    if (blocking.length) throw new Error('PUBLISH_PREFLIGHT_FAILED');
    const attempt_id = randomUUID();
    try {
      await runner.publish({
        post,
        attempt_id,
        credentials,
        media,
        persist: (publication) => {
          host.setPublication(input.id, publication);
        },
        onProgress: (fraction) =>
          send('publish-progress', {
            post_id: input.id,
            attempt_id,
            phase: 'uploading',
            fraction,
          }),
      });
    } catch (error) {
      const code = namedCode(error);
      await markReauthorizeIfNeeded(post, code);
      host.changed();
      throw new Error(code);
    }
    const updated = host.getPost(input.id);
    await markReauthorizeIfNeeded(post, updated.publication?.error ?? '');
    host.changed();
    return updated;
  });

  host.wire('post-reconcile', async (input) => {
    const post = facebookPost(input.id);
    const credentials = await host.credentials.credentials(post.channel.id);
    if (!credentials) throw new Error('CHANNEL_NOT_CONNECTED');
    try {
      await runner.reconcile({
        post,
        credentials,
        persist: (publication) => {
          host.setPublication(input.id, publication);
        },
      });
    } catch (error) {
      const code = namedCode(error);
      await markReauthorizeIfNeeded(post, code);
      host.changed();
      throw new Error(code);
    }
    const updated = host.getPost(input.id);
    await markReauthorizeIfNeeded(post, updated.publication?.error ?? '');
    host.changed();
    return updated;
  });

  return {
    get activeCount(): number {
      return pending.size;
    },
    async close(): Promise<void> {
      pending.clear();
    },
  };
}
