import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { speechErrorKey } from '../../app/ui/features/speech/error-message.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const locales = path.join(root, 'app/ui/locales');

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(filename) : [filename];
  });
}

function localeCopy(locale) {
  const copy = new Map();
  for (const file of filesBelow(path.join(locales, locale)).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('/index.ts'),
  )) {
    for (const match of readFileSync(file, 'utf8').matchAll(
      /^[ ]{2}(?:'([^']+)'|([A-Za-z_$][\w$]*)):\s*(['"])(.*)\3,$/gm,
    )) {
      copy.set(match[1] ?? match[2], match[4]);
    }
  }
  return copy;
}

// Every code a transcription can end with, grouped by what the user can do about it.
const GROUPS = [
  ['cancelled', ['CANCELLED']],
  ['sourceChanged', ['SOURCE_CHANGED', 'SOURCE_MISSING']],
  ['speechNoAudio', ['NO_AUDIO']],
  ['speechComposition', ['SPEECH_COMPOSITION_UNAVAILABLE']],
  ['rulesStale', ['STALE_OPERATION']],
  ['speechMissing', ['MODEL_MISSING']],
  ['speechRuntimeMissing', ['MODEL_RUNTIME_MISSING', 'SPEECH_PROTOCOL_UNKNOWN']],
  [
    'speechModelChanged',
    [
      'SPEECH_MODEL_CHANGED',
      'MODEL_CHANGED',
      'MODEL_HASH_MISMATCH',
      'MODEL_FILE_MISSING',
      'SPEECH_MANIFEST_INVALID',
    ],
  ],
  ['speechLanguageMissing', ['MODEL_LANGUAGE_UNAVAILABLE']],
  ['speechLimit', ['SPEECH_LIMIT', 'SPEECH_RESULT_TOO_LARGE']],
  ['speechCloudLimit', ['SPEECH_CLOUD_LIMIT']],
  ['speechDiskLow', ['SPEECH_DISK_LOW']],
  ['speechOffline', ['MODEL_NETWORK_DISABLED']],
  ['speechInferenceFailed', ['MODEL_INFERENCE_FAILED']],
  ['speechOutputInvalid', ['MODEL_OUTPUT_INVALID', 'SPEECH_TIMING_INVALID']],
  ['speechAudioFailed', ['SPEECH_AUDIO_INVALID', 'TOOL_FAILED', 'TOOL_TIMEOUT']],
  ['speechBusy', ['QUEUE_FULL', 'SESSION_LIMIT', 'EDITOR_BUSY']],
];

test('each actionable speech failure has its own copy', () => {
  for (const [key, codes] of GROUPS) {
    for (const code of codes) assert.equal(speechErrorKey(code), key, code);
  }
  const keys = GROUPS.map(([key]) => key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(!keys.includes('speechFailed'));
});

test('anything else falls back to one generic message', () => {
  for (const code of ['INVALID_REQUEST', 'WORKER_FAILURE', 'WORKER_EXITED', 'SOMETHING_NEW', '']) {
    assert.equal(speechErrorKey(code), 'speechFailed', code);
  }
});

test('speech failure copy is short end-user text in English and Vietnamese', () => {
  const en = localeCopy('en');
  const vi = localeCopy('vi');
  for (const key of [...GROUPS.map(([key]) => key), 'speechFailed']) {
    for (const [locale, copy] of [
      ['en', en],
      ['vi', vi],
    ]) {
      const text = copy.get(key);
      assert.ok(text, `${key} needs ${locale} copy`);
      assert.doesNotMatch(text, /[A-Z]{2,}_[A-Z]/, `${key} (${locale}) shows a code`);
      assert.ok(text.split(/\s+/).length <= 6, `${key} (${locale}) is too long: ${text}`);
    }
  }
});
