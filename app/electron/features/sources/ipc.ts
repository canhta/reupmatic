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

/** The one partition this feature owns. No other module may call `session.fromPartition` with
 * this name or reference the literal string elsewhere — enforced structurally by
 * `tests/native/douyin-session-native.test.mjs`. The default (undefined) session is never
 * touched by this feature. */
export const DOUYIN_PARTITION = 'persist:douyin';

const IDENTITY_COOKIES = new Set<string>(DOUYIN_IDENTITY_COOKIES);

/** The media request's referer. A plain stable value, never a signed or expiring URL. */
const DOUYIN_REFERER = 'https://www.douyin.com/';
const MAX_REQUEST_COOKIES = 64;

interface Host {
  wire: IpcWire;
  workspace: string;
  /** D-61: the one Diagnostic log sink. Douyin intake events are records from this module. */
  diagnostics?: DiagnosticRecorder;
  worker?: WorkerClient;
  media?: MediaRegistry;
  library?: () => ContentLibrary | undefined;
  getWindow?: () => BrowserWindow;
  getLanguage?: () => string;
  /** D-62: the default download folder (Settings General), reused rather than a second folder
   * setting. */
  settings?: {
    defaultDirectory(): string | undefined;
    ensureDefaultDirectory(): Promise<string | null>;
  };
}

/** The stable failure code a download re-observation reports, so the row names why it failed. */
function downloadFailureCode(kind: string): string {
  return `DOUYIN_${kind.toUpperCase()}`;
}

/** The Douyin feature's close-sequence participants: the session itself and an in-flight download
 * run, so quitting mid-download cancels it instead of orphaning the transfer. */
export interface DouyinSources {
  session: DouyinSession | undefined;
  downloads: WorkspaceParticipant | undefined;
  /** The saved-channel list's store, closed with the other participants on quit. */
  channels: WorkspaceParticipant | undefined;
}

/** Wires the Douyin session's Connect/Reconnect/Disconnect/Status IPC, one video's detail and one
 * Search over the plain HTTP web API (D-62), and the selected-items download endpoint. */
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

  // The details a search just fetched, retained host-side so a download re-resolves the item's
  // own payload without a second request. A download that outlives this cache (a later selection,
  // a restart) fetches the detail again instead; either way the media URL is read at use and
  // never stored (spec.md, "CDN URLs expire").
  const observed = new Map<string, DouyinDetail>();
  const remember = (detail: DouyinDetail) => {
    if (observed.size > 500) observed.clear();
    observed.set(detail.awemeId, detail);
    // Value-only: which public counters Douyin actually returned, so "no views" is a measured
    // fact (Douyin withholds play_count) rather than an assumption.
    const stats = detail.statistics;
    // Per item: a channel walk remembers every video, so at `info` this would bury the walk's own
    // records under hundreds of lines.
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

  // The plain page URL of the last request Douyin's edge gate refused (`verification_required`),
  // so the one headed verification action opens the user at that exact page rather than an
  // unrelated one. `null` means no refusal is on record; verify() then falls back to an ordinary
  // headed connect.
  let lastChallengedUrl: string | null = null;
  const noteChallenge = <T>(outcome: DouyinOutcome<T>, url: string): DouyinOutcome<T> => {
    if (!outcome.ok && outcome.failure.kind === 'verification_required') lastChallengedUrl = url;
    return outcome;
  };

  /** One video's detail: the web endpoint first, the mobile endpoint as fallback (D-62/D-60). */
  async function fetchDetail(awemeId: string): Promise<DouyinOutcome<DouyinDetail>> {
    const outcome = await fetchDouyinDetailPreferWeb(
      awemeId,
      await credentials(),
      Date.now(),
      diagnostics,
    );
    return noteChallenge(outcome, `/video/${awemeId}`);
  }

  /** One `aweme/post` page for the channel walk (`douyin-channel-walk.ts`'s injected port). */
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

  /** Always a fresh read over the plain HTTP web API (`fetchDetail`, unwrapped and remembered),
   * bypassing whatever `observed` retains. `observe`/`reobserve` below are the two callers: one
   * checks the retained cache first, the other deliberately skips it (D-62: a mirror that has
   * gone stale is fixed by a fresh read, not a retry of the same expired payload). */
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

  /** A download whose every mirror refused re-resolves through this (D-62's transfer hardening)
   * instead of retrying the same, possibly-expired payload `observe` would hand back. */
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
      // Sent only as request headers to the worker; never returned, logged or persisted.
      cookies: jar
        .filter((cookie) => cookie.name && cookie.value)
        .slice(0, MAX_REQUEST_COOKIES)
        .map((cookie) => ({ name: cookie.name, value: cookie.value })),
      referer: DOUYIN_REFERER,
    };
  }

  /**
   * Resolves as soon as a completed login is visible in the partition — not only when the user
   * closes Douyin's window. The `changed` event fires as the page writes cookies; once every
   * identity cookie is present the headed window is closed, which settles the pending
   * `openDouyinLoginWindow` and lets Connect report Connected straight away. Detection is still
   * from the session (`refresh()` re-reads the real jar), never from the window closing, so
   * closing without finishing a login keeps the previous status.
   */
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
    // A first login or a reconnect closes the window the moment the identity cookies land; a
    // verification re-check of an already-connected session must not, or the window would vanish
    // as soon as the challenge page touches a cookie and the user could never finish it. Either
    // way the window closes when the user closes it.
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
        // A connected session's challenge cannot be signalled by the cookie watcher (the identity
        // cookies are already there), so close once the page leaves the challenge instead.
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

  /**
   * The one headed verification action. Douyin's edge gate refusing a plain HTTP request is
   * recovered by opening the exact page it refused in a real, visible browser window and letting
   * the user clear whatever it wants there (D-62) — never a second signed capture, because the
   * HTTP path issues its own request and needs nothing captured from the page. With no recorded
   * refusal (e.g. reached from the connection bar) it falls back to the ordinary headed connect.
   * The caller (the UI's `verifyAndResume`) re-runs the search once this resolves, which retries
   * the HTTP request with whatever the window just cleared.
   */
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
      // The session is already connected, so the cookie watcher (used by login()) cannot signal a
      // cleared challenge; closing once the page leaves the challenge path is the same rule
      // login() applies to an already-connected reconnect.
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
      // A detail the host already holds (from an earlier search or download this session) is
      // reused instead of a repeat request.
      observedDetail: (awemeId) => observed.get(awemeId) ?? null,
    });
    if (outcome.status === 'recognized') {
      for (const detail of [outcome.result.exact, ...outcome.result.videos]) {
        if (detail) remember(detail);
      }
      // A channel this search returned is remembered so it can be scanned again without a link.
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
