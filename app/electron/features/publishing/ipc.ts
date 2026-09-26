import { randomUUID } from 'node:crypto';
import { type BrowserWindow, shell } from 'electron';
import type { DiagnosticRecorder } from '../../../core/diagnostics/recorder.js';
import type { Platform, Post } from '../../../core/distribution/distribution-contracts.js';
import type {
  DestinationCredentials,
  Publication,
  PublicationMedia,
  TikTokCreatorSettings,
} from '../../../core/distribution/publishing/contracts.js';
import { facebookPreflight } from '../../../core/distribution/publishing/facebook.js';
import { tiktokPreflight } from '../../../core/distribution/publishing/tiktok.js';
import { youtubePreflight } from '../../../core/distribution/publishing/youtube.js';
import type { IpcWire } from '../../runtime/ipc.js';
import type { PublishingConfig } from './config.js';
import { requireGoogleClientId, requireMeta, requireTikTok } from './config.js';
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
import { openFacebookLogin, openTikTokLogin } from './oauth-window.js';
import { PublishingService } from './publish-service.js';
import { errorCodeOf } from './publishing-error.js';
import { DEFAULT_TIKTOK_BASE_URL, TikTokDestination } from './tiktok-adapter.js';
import { TikTokApi, type TikTokCreatorInfo } from './tiktok-api.js';
import { exchangeCodeForTokens, refreshTokens, TIKTOK_AUTHORIZE_BASE_URL } from './tiktok-oauth.js';
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
  tiktokBaseUrl?: string;
  authorizeBaseUrl?: string;
  fetch?: typeof fetch;
  diagnostics?: DiagnosticRecorder;
}

const REMOTE_URL =
  /^https:\/\/(?:www\.facebook\.com\/reel\/[A-Za-z0-9_-]+|(?:www\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]+|youtu\.be\/[A-Za-z0-9_-]+)$/;

export function installPublishing(host: PublishingHost) {
  const pending = new Map<string, { pages: ConnectedPage[] }>();
  const diagnostics = publishingDiagnostics(host.diagnostics);
  // One platform-agnostic service; each attempt builds its own adapter.
  const tiktokBaseUrl = host.tiktokBaseUrl ?? DEFAULT_TIKTOK_BASE_URL;
  const service = new PublishingService({
    destinationFor: (platform, credentials, media) => {
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
      if (platform === 'tiktok')
        return new TikTokDestination({
          accessToken: credentials.access_token,
          videoSizeBytes: media?.size_bytes ?? 0,
          ...(media ? { videoDurationMs: media.duration_ms } : {}),
          baseUrl: tiktokBaseUrl,
          fetch: host.fetch,
        });
      throw new Error('PUBLISH_PLATFORM_UNSUPPORTED');
    },
  });
  function tiktokApi(accessToken: string): TikTokApi {
    return new TikTokApi({ accessToken, baseUrl: tiktokBaseUrl, fetch: host.fetch });
  }
  function settingsFrom(info: TikTokCreatorInfo): TikTokCreatorSettings {
    return {
      nickname: info.nickname,
      privacy_level_options: info.privacy_level_options,
      comment_disabled: info.comment_disabled,
      duet_disabled: info.duet_disabled,
      stitch_disabled: info.stitch_disabled,
      max_video_post_duration_ms: info.max_video_post_duration_ms,
    };
  }

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
    if (post.channel.platform === 'tiktok') return tiktokPreflight(post, media, Date.now());
    throw new Error('PUBLISH_PLATFORM_UNSUPPORTED');
  }
  /**
   * Refreshes an expired access token before any network phase; Facebook page tokens never expire,
   * Google and TikTok refresh through their broker (a failed refresh needs a new login).
   */
  async function freshCredentials(
    channelId: string,
    platform: Platform,
  ): Promise<DestinationCredentials> {
    const stored = await host.credentials.credential(channelId);
    if (!stored) throw new Error('CHANNEL_NOT_CONNECTED');
    const expiring = stored.expires_at !== null && stored.expires_at <= Date.now() + 60_000;
    if (!expiring || platform === 'facebook_page')
      return { account_id: stored.account_id, access_token: stored.access_token };
    if (platform === 'tiktok') {
      if (!stored.refresh_token) {
        await host.credentials.markReauthorize(channelId);
        throw new Error('CHANNEL_REAUTHORIZE');
      }
      try {
        const tokens = await refreshTokens(
          stored.refresh_token,
          requireTikTok(host.config).brokerUrl,
          host.fetch,
        );
        await host.credentials.updateTokens(channelId, {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: Date.now() + tokens.expires_in * 1000,
        });
        return { account_id: stored.account_id, access_token: tokens.access_token };
      } catch (error) {
        // Any failed refresh needs a new login.
        await host.credentials.markReauthorize(channelId);
        throw error;
      }
    }
    if (!stored.refresh_token) {
      await host.credentials.markReauthorize(channelId);
      throw new Error('CHANNEL_REAUTHORIZE');
    }
    try {
      const tokens = await refreshAccessToken({
        clientId: requireGoogleClientId(host.config),
        refreshToken: stored.refresh_token,
        tokenEndpoint: host.youtubeTokenEndpoint ?? GOOGLE_TOKEN_ENDPOINT,
        fetchImpl: host.fetch,
      });
      await host.credentials.updateTokens(channelId, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? stored.refresh_token,
        expires_at: tokens.expires_at,
      });
      return { account_id: stored.account_id, access_token: tokens.access_token };
    } catch (error) {
      if (errorCodeOf(error) === 'CHANNEL_REAUTHORIZE')
        await host.credentials.markReauthorize(channelId);
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

  host.wire('channel-connect-tiktok', async (input) => {
    const channel = host.getChannel(input.id);
    if (!channel) throw new Error('CHANNEL_NOT_FOUND');
    if (channel.platform !== 'tiktok') throw new Error('PUBLISH_PLATFORM_UNSUPPORTED');
    const window = host.getWindow();
    if (!window) throw new Error('WINDOW_UNAVAILABLE');
    const config = requireTikTok(host.config);
    const { code, codeVerifier } = await openTikTokLogin(window, {
      clientKey: config.clientKey,
      redirectUri: config.redirectUri,
      authorizeBaseUrl: host.authorizeBaseUrl ?? TIKTOK_AUTHORIZE_BASE_URL,
    });
    const tokens = await exchangeCodeForTokens(
      { code, codeVerifier, redirectUri: config.redirectUri },
      config.brokerUrl,
      host.fetch,
    );
    const info = await tiktokApi(tokens.access_token).creatorInfo();
    await host.credentials.save(input.id, {
      account_id: tokens.open_id,
      account_name: info.nickname,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
    });
    host.changed();
    return { account_name: info.nickname };
  });

  host.wire('tiktok-creator-info', async (input) => {
    const channel = host.getChannel(input.id);
    if (!channel) throw new Error('CHANNEL_NOT_FOUND');
    if (channel.platform !== 'tiktok') throw new Error('PUBLISH_PLATFORM_UNSUPPORTED');
    const credentials = await freshCredentials(input.id, 'tiktok');
    return settingsFrom(await tiktokApi(credentials.access_token).creatorInfo());
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
    const credentials = await freshCredentials(post.channel.id, post.channel.platform);
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
    const credentials = await freshCredentials(post.channel.id, post.channel.platform);
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
