import path from 'node:path';
import { type BrowserWindow, clipboard, session } from 'electron';
import type { DiagnosticRecorder } from '../../../core/diagnostics/recorder.js';
import type { ContentLibrary } from '../../../core/library/content-library.js';
import { DouyinChannelStore } from '../../../core/sources/douyin-channel-store.js';
import { DOUYIN_IDENTITY_COOKIES } from '../../../core/sources/douyin-contracts.js';
import { DOUYIN_ORIGIN, isDouyinChallengePath } from '../../../core/sources/douyin-discovery.js';
import type {
  DouyinDetail,
  DouyinOutcome,
} from '../../../core/sources/douyin-discovery-contracts.js';
import {
  DOUYIN_SEARCH_PAGE_CAP,
  searchDouyinText,
  toSearchView,
} from '../../../core/sources/douyin-search.js';
import { DouyinSession } from '../../../core/sources/douyin-session.js';
import { DouyinSessionStore } from '../../../core/sources/douyin-session-store.js';
import { RemoteError } from '../../../core/worker/remote-error.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';
import type { IpcWire } from '../../runtime/ipc.js';
import type { WorkspaceParticipant } from '../../runtime/workspace-lifecycle.js';
import type { MediaRegistry } from '../media/registry.js';
import { electronCookieJar } from './cookie-jar.js';
import { sourcesDiagnostics } from './diagnostics.js';
import { installDouyinDownloads } from './download.js';
import { closeDouyinLoginWindow, openDouyinLoginWindow } from './login-window.js';
import { fetchDouyinDetailPreferWeb, fetchDouyinWebPostPage } from './web-api.js';

/** The one partition this feature owns; no other module may reference this string. */
export const DOUYIN_PARTITION = 'persist:douyin';

const IDENTITY_COOKIES = new Set<string>(DOUYIN_IDENTITY_COOKIES);

/** The media request referer; a stable value, never signed or expiring. */
const DOUYIN_REFERER = 'https://www.douyin.com/';
const MAX_REQUEST_COOKIES = 64;

interface Host {
  wire: IpcWire;
  workspace: string;
  diagnostics?: DiagnosticRecorder;
  worker?: WorkerClient;
  media?: MediaRegistry;
  library?: () => ContentLibrary | undefined;
  getWindow?: () => BrowserWindow;
  getLanguage?: () => string;
  settings?: {
    defaultDirectory(): string | undefined;
    ensureDefaultDirectory(): Promise<string | null>;
  };
}

function downloadFailureCode(kind: string): string {
  return `DOUYIN_${kind.toUpperCase()}`;
}

export interface DouyinSources {
  session: DouyinSession | undefined;
  downloads: WorkspaceParticipant | undefined;
  channels: WorkspaceParticipant | undefined;
}

/** Wires the Douyin session, detail/search, and download IPC. */
export function installDouyinSources(host: Host): DouyinSources {
  const diagnostics = sourcesDiagnostics(host.diagnostics);
  diagnostics.event('feature.init');
  let douyin: DouyinSession | undefined;
  let problem = 'DOUYIN_SESSION_UNAVAILABLE';
  let partitionSession: Electron.Session | undefined;
  let channelStore: DouyinChannelStore | undefined;
  try {
    partitionSession = session.fromPartition(DOUYIN_PARTITION);
    const store = new DouyinSessionStore(path.join(host.workspace, 'douyin-session.sqlite'));
    douyin = new DouyinSession({ cookies: electronCookieJar(partitionSession), store });
    channelStore = new DouyinChannelStore(path.join(host.workspace, 'douyin-channels.sqlite'));
  } catch (error) {
    problem = error instanceof RemoteError ? error.code : problem;
  }
  const required = () => {
    if (!douyin) throw new RemoteError(problem);
    return douyin;
  };

  // Detail cache; media URLs are read at use and never stored (CDN URLs expire).
  const observed = new Map<string, DouyinDetail>();
  const remember = (detail: DouyinDetail) => {
    if (observed.size > 500) observed.clear();
    observed.set(detail.awemeId, detail);
    const stats = detail.statistics;
    diagnostics.event(
      'detail.remember',
      {
        id: detail.awemeId,
        likes: stats.diggCount,
        views: stats.playCount,
        comments: stats.commentCount,
        shares: stats.shareCount,
      },
      { level: 'debug' },
    );
  };

  // Page URL of the last verification_required refusal; null falls back to a plain connect.
  let lastChallengedUrl: string | null = null;
  const noteChallenge = <T>(outcome: DouyinOutcome<T>, url: string): DouyinOutcome<T> => {
    if (!outcome.ok && outcome.failure.kind === 'verification_required') lastChallengedUrl = url;
    return outcome;
  };

  async function fetchDetail(awemeId: string): Promise<DouyinOutcome<DouyinDetail>> {
    const outcome = await fetchDouyinDetailPreferWeb(
      awemeId,
      await credentials(),
      Date.now(),
      diagnostics,
    );
    return noteChallenge(outcome, `/video/${awemeId}`);
  }

  async function fetchChannelPage(
    secUid: string,
    maxCursor: number,
  ): Promise<DouyinOutcome<Record<string, unknown>>> {
    const outcome = await fetchDouyinWebPostPage(
      secUid,
      maxCursor,
      await credentials(),
      diagnostics,
    );
    return noteChallenge(outcome, `/user/${secUid}`);
  }

  /** Fresh HTTP read, bypassing the retained cache. */
  async function observeDetail(awemeId: string): Promise<DouyinDetail> {
    required();
    const outcome = await fetchDetail(awemeId);
    if (!outcome.ok) {
      diagnostics.event(
        'observe.failed',
        { id: awemeId, kind: outcome.failure.kind },
        { level: 'error', code: downloadFailureCode(outcome.failure.kind) },
      );
      throw new RemoteError(downloadFailureCode(outcome.failure.kind));
    }
    remember(outcome.value);
    return outcome.value;
  }

  async function observe(awemeId: string): Promise<DouyinDetail> {
    const retained = observed.get(awemeId);
    if (retained) {
      diagnostics.event('observe.retained', { id: awemeId }, { level: 'debug' });
      return retained;
    }
    return observeDetail(awemeId);
  }

  /** Re-resolves a download whose mirrors all refused, bypassing the cache. */
  async function reobserve(awemeId: string): Promise<DouyinDetail> {
    diagnostics.event('observe.reobserve', { id: awemeId });
    return observeDetail(awemeId);
  }

  async function credentials(): Promise<{
    cookies: { name: string; value: string }[];
    referer: string;
  }> {
    const jar = partitionSession
      ? await partitionSession.cookies.get({ domain: '.douyin.com' })
      : [];
    return {
      // Sent only to the worker as headers; never returned, logged or persisted.
      cookies: jar
        .filter((cookie) => cookie.name && cookie.value)
        .slice(0, MAX_REQUEST_COOKIES)
        .map((cookie) => ({ name: cookie.name, value: cookie.value })),
      referer: DOUYIN_REFERER,
    };
  }

  /** Resolves when a completed login lands in the partition, never on window close. */
  function watchForLogin(onLoggedIn: () => void): () => void {
    const target = partitionSession;
    if (!target) return () => {};
    let settled = false;
    const settleIfConnected = async () => {
      if (settled) return;
      if ((await required().refresh()).status !== 'connected') return;
      settled = true;
      onLoggedIn();
    };
    const onChanged = (
      _event: Electron.Event,
      cookie: Electron.Cookie,
      _cause: string,
      removed: boolean,
    ) => {
      if (removed || !IDENTITY_COOKIES.has(cookie.name)) return;
      void settleIfConnected();
    };
    target.cookies.on('changed', onChanged);
    return () => target.cookies.removeListener('changed', onChanged);
  }

  async function login() {
    const connection = required();
    // A reconnect closes the window once cookies land; a challenge re-check must not.
    const wasConnected = (await connection.refresh()).status === 'connected';
    diagnostics.event('login.start', { wasConnected });
    const stop = watchForLogin(() => {
      if (!wasConnected) {
        diagnostics.event('login.cookies-complete');
        closeDouyinLoginWindow(diagnostics);
      }
    });
    try {
      await openDouyinLoginWindow(DOUYIN_PARTITION, {
        // Already connected: the cookie watcher can't fire, so close on leaving the challenge.
        closeAfterChallenge: wasConnected,
        isChallengePath: (pathname) => isDouyinChallengePath(pathname),
        diagnostics,
      });
      diagnostics.event('login.window-closed');
    } finally {
      stop();
    }
    const snapshot = await connection.refresh();
    diagnostics.event('login.end', { status: snapshot.status });
    return snapshot;
  }

  /** Opens the refused page so the user can clear Douyin's challenge. */
  async function verify() {
    const connection = required();
    const challengedPath = lastChallengedUrl;
    if (!challengedPath) {
      diagnostics.event('verify.no-challenge');
      return login();
    }
    diagnostics.event('verify.start');
    await openDouyinLoginWindow(DOUYIN_PARTITION, {
      url: `${DOUYIN_ORIGIN}${challengedPath}`,
      closeAfterChallenge: true,
      isChallengePath: (pathname) => isDouyinChallengePath(pathname),
      diagnostics,
    });
    lastChallengedUrl = null;
    const snapshot = await connection.refresh();
    diagnostics.event('verify.end', { status: snapshot.status });
    return snapshot;
  }

  host.wire('douyin-status', () => required().refresh());
  host.wire('douyin-connect', () => login());
  host.wire('douyin-reconnect', () => login());
  host.wire('douyin-verify', () => verify());
  host.wire('douyin-disconnect', async () => {
    const snapshot = await required().disconnect();
    diagnostics.event('disconnect', { status: snapshot.status });
    return snapshot;
  });
  host.wire('douyin-import-cookies', async ({ text }) => {
    const snapshot = await required().importCookies(text);
    diagnostics.event('import-cookies', { status: snapshot.status });
    return snapshot;
  });
  host.wire('douyin-detail', async ({ aweme_id }) => {
    required();
    const outcome = await fetchDetail(aweme_id);
    if (outcome.ok) remember(outcome.value);
    else
      diagnostics.event(
        'detail.failed',
        { id: aweme_id, kind: outcome.failure.kind },
        { level: 'error', code: downloadFailureCode(outcome.failure.kind) },
      );
    return outcome;
  });
  host.wire('douyin-clipboard-text', async () => ({
    text: (await clipboard.readText()).slice(0, 4096),
  }));
  host.wire('douyin-search', async ({ text }) => {
    required();
    diagnostics.event('search.start');
    const outcome = await searchDouyinText(text, {
      fetchDetail,
      fetchChannelPage,
      pageCap: DOUYIN_SEARCH_PAGE_CAP,
      observedDetail: (awemeId) => observed.get(awemeId) ?? null,
    });
    if (outcome.status === 'recognized') {
      for (const detail of [outcome.result.exact, ...outcome.result.videos]) {
        if (detail) remember(detail);
      }
      const channel = outcome.result.channel;
      if (channel) {
        channelStore?.save({ secUid: channel.secUid, nickname: channel.nickname }, Date.now());
        diagnostics.event(
          'walk.end',
          {
            secUid: channel.secUid,
            retrieved: outcome.result.retrieved,
            mayHaveMore: outcome.result.mayHaveMore,
            truncated: outcome.result.truncated,
            stop:
              outcome.result.partialFailure?.kind ??
              (outcome.result.truncated ? 'truncated' : 'end'),
          },
          { level: outcome.result.partialFailure ? 'warn' : 'info' },
        );
      }
      diagnostics.event('search.recognized', {
        exact: outcome.result.exact ? 'yes' : 'no',
        videos: outcome.result.videos.length,
        retrieved: outcome.result.retrieved,
        partial: outcome.result.partialFailure?.kind ?? 'none',
      });
    } else if (outcome.status === 'failure') {
      diagnostics.event(
        'search.failure',
        { kind: outcome.failure.kind },
        { level: 'error', code: downloadFailureCode(outcome.failure.kind) },
      );
    } else {
      diagnostics.event('search.unsupported', { reason: outcome.reasonKey }, { level: 'warn' });
    }
    return toSearchView(outcome);
  });
  host.wire('douyin-channels', () => channelStore?.list() ?? []);

  let downloads: WorkspaceParticipant | undefined;
  if (host.worker && host.media && host.library && host.getWindow && host.settings) {
    downloads = installDouyinDownloads({
      wire: host.wire,
      worker: host.worker,
      media: host.media,
      library: host.library,
      getWindow: host.getWindow,
      settings: host.settings,
      observe,
      reobserve,
      credentials,
      diagnostics,
      ...(host.getLanguage ? { getLanguage: host.getLanguage } : {}),
    });
  }
  const channels: WorkspaceParticipant | undefined = channelStore
    ? { activeCount: 0, close: async () => channelStore?.close() }
    : undefined;
  return { session: douyin, downloads, channels };
}
