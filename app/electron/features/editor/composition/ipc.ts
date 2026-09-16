import { randomUUID } from 'node:crypto';
import { type BrowserWindow, dialog } from 'electron';
import {
  type CompositionClip,
  parseClip,
  parseComposition,
} from '../../../../core/editing/composition/document.js';
import type { RegisteredVideo } from '../../../../core/media/media-types.js';
import { type IpcWire, requestRecord } from '../../../runtime/ipc.js';
import { type MediaRegistry, videoFilters } from '../../media/registry.js';

export function sourceClip(source: RegisteredVideo): CompositionClip {
  return parseClip({
    id: randomUUID(),
    source: {
      path: source.path,
      name: source.name,
      sha256: source.sha256,
      duration_ms: source.duration_ms,
    },
    start_ms: 0,
    end_ms: source.duration_ms,
    speed: 1,
  });
}

export function installComposition(host: {
  wire: IpcWire;
  media: MediaRegistry;
  getWindow(): BrowserWindow;
}): void {
  host.wire('composition-start', (input) => {
    const source = host.media.getVideo(requestRecord(input, ['asset_id']).asset_id);
    const scale = Math.min(1, 4096 / Math.max(source.width, source.height));
    return parseComposition({
      version: 1,
      canvas: {
        width: Math.max(2, Math.floor((source.width * scale) / 2) * 2),
        height: Math.max(2, Math.floor((source.height * scale) / 2) * 2),
        fps: 30,
      },
      clips: [sourceClip(source)],
    });
  });
  host.wire('composition-pick', async () => {
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile', 'multiSelections'],
      filters: videoFilters,
    });
    if (chosen.canceled) return null;
    if (chosen.filePaths.length > 64) throw new Error('INVALID_COMPOSITION');
    const clips: CompositionClip[] = [];
    for (const filename of chosen.filePaths)
      clips.push(sourceClip(await host.media.registerVideo(filename)));
    return clips;
  });
  host.wire('composition-preview', (input) =>
    host.media.authorizeComposition(parseComposition(input)),
  );
}
