import { type Composition, parseComposition } from '../editing/composition/document.js';
import { RemoteError } from '../worker/remote-error.js';

export interface RegisteredComposition {
  version: 1;
  canvas: Composition['canvas'];
  clips: {
    id: string;
    source: { asset_id: string; sha256: string; duration_ms: number };
    start_ms: number;
    end_ms: number;
    speed: number;
  }[];
}

/** Native grants are checked by the host; registration pins the worker to the same bytes. */
export async function registerComposition(
  input: Composition,
  register: (params: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<RegisteredComposition> {
  const document = parseComposition(input);
  const sources = new Map<string, RegisteredComposition['clips'][number]['source']>();
  const clips: RegisteredComposition['clips'] = [];
  for (const clip of document.clips) {
    const key = JSON.stringify([clip.source.path, clip.source.sha256]);
    let source = sources.get(key);
    if (source && source.duration_ms !== clip.source.duration_ms)
      throw new RemoteError('SOURCE_CHANGED');
    if (!source) {
      const asset = await register({ path: clip.source.path, kind: 'video' });
      if (asset.sha256 !== clip.source.sha256) throw new RemoteError('SOURCE_CHANGED');
      if (typeof asset.asset_id !== 'string' || !asset.asset_id)
        throw new RemoteError('INVALID_WORKER_RESPONSE');
      source = {
        asset_id: asset.asset_id,
        sha256: clip.source.sha256,
        duration_ms: clip.source.duration_ms,
      };
      sources.set(key, source);
    }
    clips.push({
      id: clip.id,
      source,
      start_ms: clip.start_ms,
      end_ms: clip.end_ms,
      speed: clip.speed,
    });
  }
  return { version: 1, canvas: document.canvas, clips };
}
