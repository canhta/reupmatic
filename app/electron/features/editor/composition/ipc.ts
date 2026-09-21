import { randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import {
  type Composition,
  type CompositionClip,
  parseClip,
} from '../../../../core/editing/composition/document.js';
import type { RegisteredVideo } from '../../../../core/media/media-contracts.js';
import type { IpcWire } from '../../../runtime/ipc.js';
import type { MediaRegistry } from '../../media/registry.js';

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
    enabled: true,
  });
}

/** Primary source's canvas: even dimensions, max 4096-pixel edge. */
function canvasFor(source: RegisteredVideo): Composition['canvas'] {
  const scale = Math.min(1, 4096 / Math.max(source.width, source.height));
  return {
    width: Math.max(2, Math.floor((source.width * scale) / 2) * 2),
    height: Math.max(2, Math.floor((source.height * scale) / 2) * 2),
    fps: 30,
  };
}

export function installComposition(host: {
  wire: IpcWire;
  media: MediaRegistry;
  getWindow(): BrowserWindow;
}): void {
  host.wire('composition-primary', (input) => {
    const source = host.media.getVideo(input.asset_id);
    return { canvas: canvasFor(source), clip: sourceClip(source) };
  });
  // Re-registers and sha256-checks the stored row (SOURCE_CHANGED on mismatch).
  host.wire('composition-place', async (input) => {
    const primary = host.media.getVideo(input.asset_id);
    const video = await host.media.registerVideo(input.media.path);
    if (video.sha256 !== input.media.sha256) throw new Error('SOURCE_CHANGED');
    return { canvas: canvasFor(primary), placed: sourceClip(video) };
  });
  host.wire('composition-preview', (input) => host.media.authorizeComposition(input));
}
