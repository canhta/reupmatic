import {
  type Composition,
  type CompositionClip,
  parseComposition,
} from '../../editing/composition/document.js';
import { type ProjectMedia, parseProjectMedia } from '../../editing/project-media.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

export interface CompositionPrimary {
  canvas: Composition['canvas'];
  clip: CompositionClip;
}

export interface CompositionPlacement {
  canvas: Composition['canvas'];
  placed: CompositionClip;
}

export const compositionOperations = {
  'composition-primary': operation<{ asset_id: string }, CompositionPrimary>()({
    rendererMethod: 'compositionPrimary',
    validate: (input) => ({ asset_id: requestId(requestRecord(input, ['asset_id']).asset_id) }),
    toRequest: (assetId: string) => ({ asset_id: assetId }),
  }),
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
