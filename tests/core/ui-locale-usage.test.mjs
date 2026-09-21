import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ui = path.join(root, 'app/ui');

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(filename) : [filename];
  });
}

function tsFiles(directory) {
  return filesBelow(directory).filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
}

function localeKeys() {
  const files = tsFiles(path.join(ui, 'locales/en')).filter((file) => !file.endsWith('/index.ts'));
  const keys = new Set();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(
      /^[ ]{2}(?:'([^']+)'|([A-Za-z_$][\w$]*)):/gm,
    )) {
      keys.add(match[1] ?? match[2]);
    }
  }
  return keys;
}

// Keys reached only through a fully runtime string (`t(job.active.phase)`, a worker-reported
// progress phase, never a literal in this codebase) or i18next's own count-driven plural
// suffix (`t('someCount', { count })` resolves to `someCount_one`/`someCount_other`). Neither
// form leaves a literal key name anywhere in source for a static scan to find. A prefix ending
// in `_` matches any key with that prefix (an enum-driven `t(\`prefix_${value}\`)` call); every
// other entry matches one exact key.
const ALLOWED_DYNAMIC_KEYS = [
  'visionDecoding',
  'visionRecognizing',
  'visionInpainting',
  'visionEncoding',
  'speechDecoding',
  'speechRecognizing',
  'compositionEncoding',
  'visionLanguage_',
  'postState_',
  'postView_',
  'platform_',
  'connection_',
  'libraryAvailability_',
  'libraryLink_',
  'libraryFilterOrigin_',
  'libraryFilterMedia_',
  'libraryFilterDuration_',
  'libraryFilterResolution_',
  'libraryFilterSize_',
  'libraryFilterDate_',
  'libraryFilterLinked_',
  'douyinFilterDuration_',
  'douyinFilterViews_',
  'douyinSearchSort_',
  'douyinDownloadState_',
  'assetStatus_',
  'folderState_',
  'batchState_',
  'batchPhase_',
  'workflowRun_',
  'labelKind_',
  'textLayer_',
  'qc_',
  'rulesScope_',
  'rulesMode_',
  'editFit_',
  'editFlip_',
  'editRotate_',
  'editCrop_',
  'editColor_',
  'editLogoAnchor_',
  'style_',
  'stylePosition_',
  'soundtrack_',
];
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

function isAllowedDynamic(key) {
  return ALLOWED_DYNAMIC_KEYS.some((entry) =>
    entry.endsWith('_') ? key.startsWith(entry) : key === entry,
  );
}

function pluralBase(key) {
  const suffix = PLURAL_SUFFIXES.find((candidate) => key.endsWith(candidate));
  return suffix ? key.slice(0, -suffix.length) : key;
}

test('every UI locale key is referenced somewhere in app source', () => {
  const keys = localeKeys();
  // The whole `t('key')`/`t(\`key\`)` surface, plus indirect key-returning helpers
  // (settings/model-status.ts, feature error-message.ts modules) that hold the key as a plain
  // string literal rather than an inline `t()` call — both leave a quoted literal in source.
  const scanRoots = ['app/ui', 'app/core', 'app/electron'].map((dir) => path.join(root, dir));
  const source = scanRoots
    .flatMap((dir) =>
      tsFiles(dir).filter((file) => !file.includes(`${path.sep}locales${path.sep}`)),
    )
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');

  const unused = [...keys]
    .filter((key) => !isAllowedDynamic(key))
    .filter((key) => {
      const base = pluralBase(key);
      const literal = new RegExp(`['"\`]${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
      return !literal.test(source);
    })
    .sort();

  assert.deepEqual(
    unused,
    [],
    `Unreferenced locale keys (delete from en+vi): ${unused.join(', ')}`,
  );
});
