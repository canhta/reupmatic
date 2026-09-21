import { audioOperations } from './operations/audio.js';
import { automationOperations } from './operations/automation.js';
import { batchOperations } from './operations/batch.js';
import { catalogOperations } from './operations/catalog.js';
import { compositionOperations } from './operations/composition.js';
import { diagnosticsOperations } from './operations/diagnostics.js';
import { distributionOperations } from './operations/distribution.js';
import { editorOperations } from './operations/editor.js';
import { folderOperations } from './operations/folders.js';
import { libraryOperations } from './operations/library.js';
import { profilesOperations } from './operations/profiles.js';
import { recoveryOperations } from './operations/recovery.js';
import { settingsOperations } from './operations/settings.js';
import { sourcesOperations } from './operations/sources.js';
import { speechOperations } from './operations/speech.js';
import { synthesisOperations } from './operations/synthesis.js';
import { translationOperations } from './operations/translation.js';
import { visionOperations } from './operations/vision.js';
import { appOperations } from './operations/workspace.js';

/** Capability-owned parts of the renderer-to-host contract, exposed for structural verification. */
export const operationGroups = {
  library: libraryOperations,
  batch: batchOperations,
  folders: folderOperations,
  automation: automationOperations,
  settings: settingsOperations,
  sources: sourcesOperations,
  catalog: catalogOperations,
  distribution: distributionOperations,
  diagnostics: diagnosticsOperations,
  profiles: profilesOperations,
  recovery: recoveryOperations,
  speech: speechOperations,
  synthesis: synthesisOperations,
  translation: translationOperations,
  vision: visionOperations,
  editor: editorOperations,
  audio: audioOperations,
  composition: compositionOperations,
  workspace: appOperations,
} as const;

/** The one canonical renderer-to-host operation registry consumed by both boundary adapters. */
export const operations = {
  ...libraryOperations,
  ...batchOperations,
  ...folderOperations,
  ...automationOperations,
  ...settingsOperations,
  ...sourcesOperations,
  ...catalogOperations,
  ...distributionOperations,
  ...diagnosticsOperations,
  ...profilesOperations,
  ...recoveryOperations,
  ...speechOperations,
  ...synthesisOperations,
  ...translationOperations,
  ...visionOperations,
  ...editorOperations,
  ...audioOperations,
  ...compositionOperations,
  ...appOperations,
} as const;
