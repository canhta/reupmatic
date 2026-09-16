import { type BrowserWindow, dialog } from 'electron';
import { LibraryAssets } from '../../../../core/library/library-assets.js';
import type { LibraryStore } from '../../../../core/library/library-store.js';
import type { LibraryAssetQuery, LibraryLinkKind } from '../../../../core/library/library-types.js';
import type { WorkerClient } from '../../../../core/worker/worker-client.js';
import { type IpcWire, requestId, requestRecord } from '../../../runtime/ipc.js';
import { audioFilters } from '../../editor/audio/ipc.js';
import { type MediaRegistry, videoFilters } from '../../media/registry.js';

interface Host {
  wire: IpcWire;
  media: MediaRegistry;
  worker: WorkerClient;
  getWindow(): BrowserWindow;
}

export function installLibraryAssets(
  host: Host,
  getStore: () => LibraryStore,
  changed: () => void,
): void {
  host.wire('library-assets', (input) => getStore().assets(input as LibraryAssetQuery));
  host.wire('library-asset-attach', async (input) => {
    const value = requestRecord(input, ['item_id', 'kind']);
    const itemId = requestId(value.item_id);
    const kind = value.kind as LibraryLinkKind;
    if (!['project', 'subtitle', 'export', 'audio'].includes(kind))
      throw new Error('INVALID_REQUEST');
    getStore().get(itemId);
    const filters =
      kind === 'audio'
        ? audioFilters
        : kind === 'export'
          ? videoFilters
          : [
              {
                name: kind === 'project' ? 'Reupmatic project' : 'Subtitles',
                extensions: kind === 'project' ? ['json'] : ['srt', 'ass'],
              },
            ];
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile'],
      filters,
    });
    if (chosen.canceled) return null;
    const filename = chosen.filePaths[0];
    if (kind === 'audio') await host.media.registerAudio(filename);
    if (kind === 'export') await host.media.registerVideo(filename);
    if (kind === 'subtitle') {
      const asset_id = await host.media.registerSubtitle(filename);
      await host.worker.request('subtitles.load', { asset_id }).result;
    }
    const asset = await new LibraryAssets(getStore()).register(itemId, kind, filename);
    changed();
    return asset;
  });
  host.wire('library-asset-check', async (input) => {
    const value = requestRecord(input, ['item_id', 'link_id']);
    const item = requestId(value.item_id),
      link = requestId(value.link_id);
    try {
      await new LibraryAssets(getStore()).resolve(item, link);
      return { availability: 'available' };
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'SOURCE_CHANGED') return { availability: 'changed' };
      if (code === 'SOURCE_UNAVAILABLE') return { availability: 'missing' };
      throw error;
    }
  });
  host.wire('library-asset-preview', async (input) => {
    const value = requestRecord(input, ['item_id', 'link_id']);
    const assets = new LibraryAssets(getStore());
    const itemId = requestId(value.item_id),
      linkId = requestId(value.link_id);
    const link = await assets.resolve(itemId, linkId);
    if (link.kind === 'project') throw new Error('INVALID_REQUEST');
    let result: Record<string, unknown>;
    if (link.kind === 'export') {
      const video = await host.media.registerVideo(link.path);
      if (video.sha256 !== link.sha256) throw new Error('SOURCE_CHANGED');
      result = {
        kind: link.kind,
        name: link.name,
        url: host.media.publicVideo(video).url,
        duration_ms: video.duration_ms,
      };
    } else if (link.kind === 'audio') {
      const audio = await host.media.registerAudio(link.path);
      if (audio.source.sha256 !== link.sha256) throw new Error('SOURCE_CHANGED');
      result = {
        kind: link.kind,
        name: link.name,
        url: audio.url,
        duration_ms: audio.source.duration_ms,
      };
    } else {
      const asset_id = await host.media.registerSubtitle(link.path);
      const data = await host.worker.request('subtitles.load', { asset_id }).result;
      result = { kind: link.kind, name: link.name, cues: data.cues };
    }
    await assets.resolve(itemId, linkId);
    return result;
  });
}
