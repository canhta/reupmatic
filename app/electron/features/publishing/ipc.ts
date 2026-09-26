import { randomUUID } from 'node:crypto';
import { type BrowserWindow, shell } from 'electron';
import type { DiagnosticRecorder } from '../../../core/diagnostics/recorder.js';
import type { Platform, Post } from '../../../core/distribution/distribution-contracts.js';
import type {
  DestinationCredentials,
  Publication,
  PublicationMedia,
} from '../../../core/distribution/publishing/contracts.js';
import { facebookPreflight } from '../../../core/distribution/publishing/facebook.js';
import { youtubePreflight } from '../../../core/distribution/publishing/youtube.js';
import type { IpcWire } from '../../runtime/ipc.js';
import type { PublishingConfig } from './config.js';
import { requireGoogleClientId, requireMeta } from './config.js';
import type { ChannelCredentialStore } from './credential-store.js';
import { publishingDiagnostics } from './diagnostics.js';
import {
  DEFAULT_GRAPH_BASE_URL,
  DEFAULT_UPLOAD_BASE_URL,
  FacebookDestination,
} from './facebook-adapter.js';
import {
  type ConnectedPage,
  DEFAULT_OAUTH_BASE_URL,
  exchangeCodeForUserToken,
  listPages,
} from './oauth.js';
import { GOOGLE_TOKEN_ENDPOINT, refreshAccessToken } from './oauth-loopback.js';
import { openFacebookLogin } from './oauth-window.js';
import { PublishingService } from './publish-service.js';
import { errorCodeOf } from './publishing-error.js';
import { YOUTUBE_UPLOAD_ENDPOINT, YouTubeDestination } from './youtube-adapter.js';
import { connectYouTubeChannel } from './youtube-connect.js';

export interface PublishingHost {
  wire: IpcWire;
  credentials: ChannelCredentialStore;
  getPost(id: string): Post;
  getChannel(id: string): { name: string; platform: Platform } | undefined;
  setPublication(id: string, publication: Publication): Post;
  getWindow(): BrowserWindow | undefined;
  probeMedia(path: string): Promise<PublicationMedia>;
  changed(): void;
  config: PublishingConfig | null;
  graphBaseUrl?: string;
  uploadBaseUrl?: string;
  oauthBaseUrl?: string;
  youtubeUploadEndpoint?: string;
  youtubeTokenEndpoint?: string;
  fetch?: typeof fetch;
  diagnostics?: DiagnosticRecorder;
}

const REMOTE_URL =
  /^https:\/\/(?:www\.facebook\.com\/reel\/[A-Za-z0-9_-]+|(?:www\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]+|youtu\.be\/[A-Za-z0-9_-]+)$/;

export function installPublishing(host: PublishingHost) {
  const pending = new Map<string, { pages: ConnectedPage[] }>();
  const diagnostics = publishingDiagnostics(host.diagnostics);
  // One platform-agnostic service; each attempt builds its own adapter.
  const service = new PublishingService({
    destinationFor: (platform, credentials) => {
      if (platform === 'facebook_page')
        return new FacebookDestination({
          pageId: credentials.account_id,
          accessToken: credentials.access_token,
          graphBaseUrl: host.graphBaseUrl ?? DEFAULT_GRAPH_BASE_URL,
          uploadBaseUrl: host.uploadBaseUrl ?? DEFAULT_UPLOAD_BASE_URL,
          fetch: host.fetch,
        });
      if (platform === 'youtube')
        return new YouTubeDestination({
          uploadEndpoint: host.youtubeUploadEndpoint ?? YOUTUBE_UPLOAD_ENDPOINT,
          fetchImpl: host.fetch,
          diagnostics,
        });
      throw new Error('PUBLISH_PLATFORM_UNSUPPORTED');
    },
  });

  function requireConfig(): PublishingConfig {
    if (!host.config) throw new Error('PUBLISHING_NOT_CONFIGURED');
    return host.config;
  }
  function send(channel: string, message: unknown): void {
    const window = host.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(`reupmatic:${channel}`, message);
  }
  function preflightFor(post: Post, media: PublicationMedia) {
    if (post.channel.platform === 'youtube') return youtubePreflight(post, media, Date.now());
    if (post.channel.platform === 'facebook_page')
      return facebookPreflight(post, media, Date.now());
    throw new Error('PUBLISH_PLATFORM_UNSUPPORTED');
  }
  /** Refreshes an expired Google access token before any network phase; page tokens never expire. */
  async function freshCredentials(post: Post): Promise<DestinationCredentials> {
    const stored = await host.credentials.credential(post.channel.id);
    if (!stored) throw new Error('CHANNEL_NOT_CONNECTED');
    const expiring = stored.expires_at !== null && stored.expires_at <= Date.now() + 60_000;
    if (post.channel.platform !== 'youtube' || !expiring)
      return { account_id: stored.account_id, access_token: stored.access_token };
    if (!stored.refresh_token) {
      await host.credentials.markReauthorize(post.channel.id);
      throw new Error('CHANNEL_REAUTHORIZE');
    }
    try {
      const tokens = await refreshAccessToken({
        clientId: requireGoogleClientId(host.config),
        refreshToken: stored.refresh_token,
        tokenEndpoint: host.youtubeTokenEndpoint ?? GOOGLE_TOKEN_ENDPOINT,
        fetchImpl: host.fetch,
      });
      await host.credentials.updateTokens(post.channel.id, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? stored.refresh_token,
        expires_at: tokens.expires_at,
      });
      return { account_id: stored.account_id, access_token: tokens.access_token };
    } catch (error) {
      if (errorCodeOf(error) === 'CHANNEL_REAUTHORIZE')
        await host.credentials.markReauthorize(post.channel.id);
      throw error;
    }
  }
  async function publishable(id: string): Promise<{ post: Post; media: PublicationMedia }> {
    const post = host.getPost(id);
    const media = await host.probeMedia(post.export.path);
    if (preflightFor(post, media).some((problem) => problem.severity === 'blocking'))
      throw new Error('PUBLISH_PREFLIGHT_FAILED');
    return { post, media };
  }

  host.wire('channel-connect-start', async (input) => {
    const config = requireConfig();
    const window = host.getWindow();
    if (!window) throw new Error('WINDOW_UNAVAILABLE');
    const code = await openFacebookLogin(window, {
      appId: requireMeta(config).metaAppId,
      oauthBaseUrl: host.oauthBaseUrl ?? DEFAULT_OAUTH_BASE_URL,
    });
    const userToken = await exchangeCodeForUserToken(
      code,
      requireMeta(config).brokerUrl,
      host.fetch,
    );
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

  host.wire('channel-connect', async (input) => {
    const channel = host.getChannel(input.id);
    if (!channel) throw new Error('CHANNEL_NOT_FOUND');
    if (channel.platform !== 'youtube') throw new Error('PUBLISH_PLATFORM_UNSUPPORTED');
    const tokens = await connectYouTubeChannel({
      window: host.getWindow(),
      clientId: requireGoogleClientId(host.config),
      tokenEndpoint: host.youtubeTokenEndpoint,
      fetchImpl: host.fetch,
    });
    await host.credentials.save(input.id, {
      account_id: input.id,
      account_name: channel.name,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
    });
    host.changed();
    return { account_name: channel.name };
  });

  host.wire('channel-disconnect', async (input) => {
    await host.credentials.remove(input.id);
    pending.delete(input.id);
    host.changed();
    return { disconnected: true } as const;
  });

  host.wire('post-preflight', async (input) => {
    const post = host.getPost(input.id);
    const media = await host.probeMedia(post.export.path);
    return preflightFor(post, media);
  });

  host.wire('post-publish', async (input) => {
    const { post, media } = await publishable(input.id);
    const credentials = await freshCredentials(post);
    const attempt_id = randomUUID();
    try {
      await service.publish({
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
      const code = errorCodeOf(error);
      if (code === 'CHANNEL_REAUTHORIZE') await host.credentials.markReauthorize(post.channel.id);
      host.changed();
      throw new Error(code);
    }
    host.changed();
    return host.getPost(input.id);
  });

  host.wire('post-reconcile', async (input) => {
    const post = host.getPost(input.id);
    const credentials = await freshCredentials(post);
    try {
      await service.reconcile({
        post,
        credentials,
        persist: (publication) => {
          host.setPublication(input.id, publication);
        },
      });
    } catch (error) {
      const code = errorCodeOf(error);
      if (code === 'CHANNEL_REAUTHORIZE') await host.credentials.markReauthorize(post.channel.id);
      host.changed();
      throw new Error(code);
    }
    host.changed();
    return host.getPost(input.id);
  });

  host.wire('post-open-remote', async (input) => {
    const url = host.getPost(input.id).publication?.remote_url;
    if (!url || !REMOTE_URL.test(url)) throw new Error('PUBLICATION_MISSING');
    await shell.openExternal(url);
    return { opened: true } as const;
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
