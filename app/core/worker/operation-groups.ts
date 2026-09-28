import { assetOperations } from './operations/assets.js';
import { mediaOperations } from './operations/media.js';
import { modelOperations } from './operations/models.js';
import { runtimeOperations } from './operations/runtime.js';
import { speechOperations } from './operations/speech.js';
import { subtitleOperations } from './operations/subtitles.js';

export const operationGroups = {
  runtime: runtimeOperations,
  models: modelOperations,
  assets: assetOperations,
  media: mediaOperations,
  subtitles: subtitleOperations,
  speech: speechOperations,
} as const;

export const operations = {
  ...runtimeOperations,
  ...modelOperations,
  ...assetOperations,
  ...mediaOperations,
  ...subtitleOperations,
  ...speechOperations,
} as const;
