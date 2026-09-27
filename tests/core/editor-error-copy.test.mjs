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

function localeKeys(locale) {
  const keys = new Set();
  for (const file of filesBelow(path.join(ui, 'locales', locale)).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('/index.ts'),
  )) {
    for (const match of readFileSync(file, 'utf8').matchAll(
      /^[ ]{2}(?:'([^']+)'|([A-Za-z_$][\w$]*)):/gm,
    )) {
      keys.add(match[1] ?? match[2]);
    }
  }
  return keys;
}

/** The editor's code -> copy-key table, read from source so it cannot drift silently. */
function editorErrorKeys() {
  const source = readFileSync(path.join(ui, 'features/editor/EditorWorkspace.tsx'), 'utf8');
  const entries = new Map();
  for (const match of source.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):\s*'([A-Za-z][A-Za-z0-9_]*)',/gm)) {
    entries.set(match[1], match[2]);
  }
  return entries;
}

// Every code the project save/open/recovery, voice and vision boundaries can hand the editor.
const REQUIRED_CODES = [
  'PROJECT_FONT_UNSUPPORTED',
  'PROJECT_MISSING',
  'ENOENT',
  'INVALID_RECOVERY',
  'RECOVERY_CORRUPT',
  'RECOVERY_CONFLICT',
  'RECOVERY_MISSING',
  'RECOVERY_VERSION',
  'RECOVERY_UNAVAILABLE',
  'RECOVERY_SOURCE_CONFLICT',
  'INVALID_VOICE_TRACK',
  'VOICE_TRACK_STALE',
  'SYNTHESIS_MODEL_CHANGED',
  'SYNTHESIS_VOICE_MODEL_MISSING',
  'SYNTHESIS_VOICE_UNAVAILABLE',
  'SYNTHESIS_ARTIFACT_MISSING',
  'SYNTHESIS_ARTIFACT_ALTERED',
  'SYNTHESIS_ARTIFACT_INVALID',
  'SYNTHESIS_ARTIFACT_LIMIT',
  'INVALID_VOICE',
  'UNKNOWN_ARTIFACT',
  'MODEL_LANGUAGE_UNAVAILABLE',
  'RUNTIME_PACK_MISSING',
  'VISION_EVIDENCE_LIMIT',
  'VISION_FRAME_INVALID',
];

test('every error code the editor maps has English and Vietnamese copy, and none is raw', () => {
  const en = localeKeys('en');
  const vi = localeKeys('vi');
  const mapped = editorErrorKeys();

  for (const code of REQUIRED_CODES) {
    assert.ok(mapped.has(code), `${code} must be mapped in EditorWorkspace errorKeys`);
  }

  const missing = [];
  for (const [code, key] of mapped) {
    if (!en.has(key)) missing.push(`${code} -> ${key} (en)`);
    if (!vi.has(key)) missing.push(`${code} -> ${key} (vi)`);
  }
  assert.deepEqual(missing, [], `Mapped error codes without copy: ${missing.join(', ')}`);
});

test('the editor falls back to copy, not a raw code, and shows cancellation as info', () => {
  const source = readFileSync(path.join(ui, 'features/editor/EditorWorkspace.tsx'), 'utf8');
  // The one fallback is a real copy key; nothing renders the raw code itself.
  assert.match(source, /: 'failed'\)/);
  assert.match(source, /raise\(message, \{ kind: 'info', uniqueID: error \}\)/);
});
