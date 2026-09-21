import {
  type Composition,
  type CompositionClip,
  parseComposition,
} from '../../editing/composition/document.js';
import { type ProjectMedia, parseProjectMedia } from '../../editing/project-media.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

/**
 * The primary source's own clip and the canvas a new composition would use:
 * the shape the clips lane draws before any composition exists, and the same
 * clip `composition-place` never has to re-send (D-63, ED-P01).
 */
export interface CompositionPrimary {
  canvas: Composition['canvas'];
  clip: CompositionClip;
}

/**
 * One Project media video placement: the clip to put on the timeline plus the
 * canvas a document with no composition yet should adopt in the same round trip
 * (D-63, ED-P01).
 */
export interface CompositionPlacement {
  canvas: Composition['canvas'];
  placed: CompositionClip;
}

export const compositionOperations = {
  // The primary video always shows as a clip on the timeline (every reference
  // editor does); this returns its clip and canvas without creating a
  // composition, so an unplaced project still draws the lane (ticket 05 review).
  'composition-primary': operation<{ asset_id: string }, CompositionPrimary>()({
    rendererMethod: 'compositionPrimary',
    validate: (input) => ({ asset_id: requestId(requestRecord(input, ['asset_id']).asset_id) }),
    toRequest: (assetId: string) => ({ asset_id: assetId }),
  }),
  // "Add to timeline" and dropping a Project media row both land here: the
  // stored video is re-registered and its sha256 checked, and the clip to place
  // comes back with the canvas a first placement adopts. There is no separate
  // "start composition" step (ticket 05).
  'composition-place': operation<{ asset_id: string; media: ProjectMedia }, CompositionPlacement>()(
    {
      rendererMethod: 'compositionPlace',
      validate: (input) => {
        const value = requestRecord(input, ['asset_id', 'media']);
        const [media] = parseProjectMedia([value.media]);
        if (media.kind !== 'video') throw new Error('INVALID_REQUEST');
        return { asset_id: requestId(value.asset_id), media };
      },
    },
  ),
  'composition-preview': operation<Composition, { clips: { id: string; url: string }[] }>()({
    rendererMethod: 'compositionPreview',
    validate: (input) => parseComposition(input),
  }),
} as const;
