import { type BrowserWindow, dialog } from 'electron';
import type { ContentLibrary } from '../../../../core/library/content-library.js';
import type { ContentAssetPreview } from '../../../../core/library/library-contracts.js';
import type { WorkerClient } from '../../../../core/worker/worker-client.js';
import type { IpcWire } from '../../../runtime/ipc.js';
import {
  audioFilters,
  type MediaRegistry,
  subtitleFilters,
  videoFilters,
} from '../../media/registry.js';

interface Host {
  wire: IpcWire;
  media: MediaRegistry;
  worker: WorkerClient;
  getWindow(): BrowserWindow;
}

export function installLibraryAssets(
  host: Host,
  getLibrary: () => ContentLibrary,
  changed: () => void,
): void {
  host.wire('library-assets', (input) => getLibrary().listAssets(input));
  host.wire('library-asset-attach', async (input) => {
    const { item_id: itemId, kind } = input;
    getLibrary().getContent(itemId);
    const filters =
      kind === 'audio'
        ? audioFilters
        : kind === 'export'
          ? videoFilters
          : kind === 'subtitle'
            ? subtitleFilters
            : [{ name: 'Reupmatic project', extensions: ['json'] }];
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile'],
      filters,
    });
    if (chosen.canceled) return null;
    const filename = chosen.filePaths[0];
    if (kind === 'audio') await host.media.registerAudio(filename);
    if (kind === 'export') await host.media.registerVideo(filename);
    if (kind === 'subtitle') {
      const subtitle = await host.media.registerSubtitle(filename);
      await host.worker.request('subtitles.load', { asset_id: subtitle.asset_id }).result;
    }
    const asset = await getLibrary().registerAsset(itemId, kind, filename);
    changed();
    return asset;
  });
  host.wire('library-asset-check', async (input) => {
    const { item_id: item, link_id: link } = input;
    try {
      await getLibrary().resolveAsset(item, link);
      return { availability: 'available' };
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'SOURCE_CHANGED') return { availability: 'changed' };
      if (code === 'SOURCE_UNAVAILABLE') return { availability: 'missing' };
      throw error;
    }
  });
  host.wire('library-asset-preview', async (input) => {
    const { item_id: itemId, link_id: linkId } = input;
    const link = await getLibrary().resolveAsset(itemId, linkId);
    if (link.kind === 'project') throw new Error('INVALID_REQUEST');
    let result: ContentAssetPreview;
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
      const subtitle = await host.media.registerSubtitle(link.path);
      const data = await host.worker.request('subtitles.load', { asset_id: subtitle.asset_id })
        .result;
      result = { kind: link.kind, name: link.name, cues: data.cues };
    }
    await getLibrary().resolveAsset(itemId, linkId);
    return result;
  });
}
