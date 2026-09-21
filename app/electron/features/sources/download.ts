import path from 'node:path';
import { type BrowserWindow, dialog } from 'electron';
import type { ContentLibrary } from '../../../core/library/content-library.js';
import { buildDouyinIntake, probeFactsFromDownload } from '../../../core/library/douyin/intake.js';
import type { ContentMediaKind } from '../../../core/library/library-contracts.js';
import type { MediaDownloadResult } from '../../../core/media/media-contracts.js';
import type { DouyinDetail } from '../../../core/sources/douyin-discovery-contracts.js';
import {
  type DouyinDownloadRequest,
  type DouyinDownloadSnapshot,
  douyinDownloadFilename,
} from '../../../core/sources/douyin-download.js';
import { createDouyinDownloadQueue } from '../../../core/sources/douyin-download-queue.js';
import type { Ticket, WorkerClient } from '../../../core/worker/worker-client.js';
import type { IpcWire } from '../../runtime/ipc.js';
import type { MediaRegistry } from '../media/registry.js';
import {
  recordDouyinDownloadTransitions,
  type SourcesDiagnostics,
  sourcesDiagnostics,
} from './diagnostics.js';

interface DownloadCredentials {
  cookies: readonly { name: string; value: string }[];
  referer: string | null;
}

export interface DownloadDestinationSettings {
  defaultDirectory(): string | undefined;
  ensureDefaultDirectory(): Promise<string | null>;
}

export interface DouyinDownloadHost {
  wire: IpcWire;
  worker: WorkerClient;
  media: MediaRegistry;
  library(): ContentLibrary | undefined;
  getWindow(): BrowserWindow;
  settings: DownloadDestinationSettings;
  observe(awemeId: string): Promise<DouyinDetail>;
  reobserve(awemeId: string): Promise<DouyinDetail>;
  /** Cookies/referer read at use time; never logged or returned. */
  credentials(): Promise<DownloadCredentials>;
  getLanguage?(): string;
  now?(): number;
  diagnostics?: SourcesDiagnostics;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '-';
  }
}

function mediaKindOf(detail: DouyinDetail): ContentMediaKind {
  return detail.mediaType === 'video' ? 'video' : detail.mediaType;
}

function requireLibrary(host: DouyinDownloadHost): ContentLibrary {
  const library = host.library();
  if (!library) throw new Error('LIBRARY_UNAVAILABLE');
  return library;
}

/** Electron seams for the core Douyin download queue. */
export function installDouyinDownloads(host: DouyinDownloadHost) {
  let activeTicket: Ticket<unknown> | null = null;
  const diagnostics = host.diagnostics ?? sourcesDiagnostics(undefined);
  let lastSnapshot: DouyinDownloadSnapshot | null = null;

  function send(snapshot: DouyinDownloadSnapshot) {
    recordDouyinDownloadTransitions(diagnostics, lastSnapshot, snapshot);
    lastSnapshot = snapshot;
    const window = host.getWindow();
    if (window && !window.isDestroyed())
      window.webContents.send('reupmatic:douyin-download', snapshot);
  }

  async function download(request: DouyinDownloadRequest): Promise<MediaDownloadResult> {
    // No cookie: the CDN URL is already the signed credential; don't expose the session cookie.
    const credentials = await host.credentials();
    const ticket = host.worker.request('media.download', {
      url: request.url,
      destination: request.destination,
      referer: credentials.referer,
      // No expected_size: Douyin's size is a claim; Content-Length + FFmpeg probe verify.
      resume: true,
    });
    activeTicket = ticket as unknown as Ticket<unknown>;
    diagnostics.event('download.transfer', {
      job: ticket.id,
      host: hostOf(request.url),
      mirror: request.mirror_index,
      mirror_count: request.mirror_count,
    });
    try {
      return (await ticket.result) as MediaDownloadResult;
    } finally {
      activeTicket = null;
    }
  }

  const queue = createDouyinDownloadQueue({
    findHeld: (awemeId) => host.library()?.findContentByAwemeId(awemeId) ?? null,
    observe: (awemeId) => host.observe(awemeId),
    reobserve: (awemeId) => host.reobserve(awemeId),
    destinationFor: (detail, _tierIndex, directory) =>
      path.join(directory, douyinDownloadFilename(detail)),
    download,
    commit: async ({ detail, file, tierIndex, servedBy, downloadedAt }) => {
      const library = requireLibrary(host);
      const intake = buildDouyinIntake({
        detail,
        downloadedAt,
        takenTierIndex: tierIndex,
        probe: probeFactsFromDownload(file),
        servedBy,
      });
      const item = await library.registerDouyinContent(
        {
          path: file.path,
          name: path.basename(file.path),
          sha256: file.sha256,
          size_bytes: file.bytes,
          media_kind: mediaKindOf(detail),
          video:
            detail.mediaType === 'video'
              ? {
                  duration_ms: file.duration_ms,
                  width: file.width,
                  height: file.height,
                  has_audio: file.has_audio,
                }
              : null,
          audio: null,
          origin: {
            kind: 'douyin',
            aweme_id: detail.awemeId,
            sec_uid: detail.author.secUid,
            share_url: detail.shareUrl,
          },
          published_at: detail.createTime === null ? null : detail.createTime * 1000,
        },
        intake,
        detail.raw,
      );
      host.media.originalPaths.add(item.path);
      const window = host.getWindow();
      if (window && !window.isDestroyed()) window.webContents.send('reupmatic:library-changed');
      return { id: item.id };
    },
    ...(host.now ? { now: host.now } : {}),
    onProgress: send,
  });

  /** Default folder, or a per-run "Save to…" pick; null if the picker was dismissed. */
  async function resolveDirectory(saveTo: boolean): Promise<string | null> {
    if (saveTo) {
      const window = host.getWindow();
      const chosen = await dialog.showOpenDialog(window, {
        properties: ['openDirectory', 'createDirectory'],
        title:
          host.getLanguage?.() === 'vi'
            ? 'Chọn thư mục tải về cho lần này'
            : 'Choose where to save this download',
      });
      if (chosen.canceled || chosen.filePaths.length === 0) return null;
      return chosen.filePaths[0];
    }
    return host.settings.defaultDirectory() ?? (await host.settings.ensureDefaultDirectory());
  }

  host.wire('douyin-download', async (input) => {
    requireLibrary(host);
    const directory = await resolveDirectory(input.save_to === true);
    if (!directory) {
      diagnostics.event('download.picker-dismissed', { items: input.items.length });
      return null;
    }
    const selections = input.items.map((item) => ({
      awemeId: item.aweme_id,
      tierIndex: item.tier_index,
      directory,
    }));
    const added = queue.enqueue(selections);
    diagnostics.event('download.enqueue', {
      requested: input.items.length,
      added: added.length,
    });
    return queue.snapshot();
  });

  host.wire('douyin-download-cancel', async () => {
    const requested = Boolean(activeTicket);
    queue.cancel();
    try {
      await activeTicket?.cancel();
    } catch {
      // The transfer was already gone.
    }
    return { requested };
  });

  return {
    get activeCount() {
      return queue
        .snapshot()
        .items.filter((item) => item.state === 'queued' || item.state === 'running').length;
    },
    async close() {
      queue.cancel();
      await activeTicket?.cancel().catch(() => undefined);
    },
  };
}
