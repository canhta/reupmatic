import { type AudioSource, parseSoundtrack, type Soundtrack } from '../../editing/soundtrack.js';
import { operation } from '../operation-contract.js';

export const audioOperations = {
  'audio-pick': operation<undefined, AudioSource | null>()({
    rendererMethod: 'audioPick',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'audio-preview': operation<Soundtrack, { url: string }>()({
    rendererMethod: 'audioPreview',
    validate: (input) => parseSoundtrack(input),
  }),
} as const;
