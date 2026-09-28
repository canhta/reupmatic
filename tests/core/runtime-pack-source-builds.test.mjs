import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SOURCE_BUILDS } from '../../scripts/runtime-pack-source-builds.mjs';

const pinned = (file, name) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').match(
    new RegExp(`^${name}==(\\S+)$`, 'm'),
  )?.[1];

// PyPI has no cp314 Windows x64 wheel for kaldi-native-fbank; the pack must build its sdist.
test('the Windows synthesis pack builds kaldi-native-fbank from its pinned sdist', () => {
  const build = SOURCE_BUILDS['win32-x64']?.find((entry) => entry.name === 'kaldi-native-fbank');
  assert.ok(build, 'win32-x64 has no kaldi-native-fbank source build');
  assert.equal(build.version, pinned('worker/requirements-pack-synthesis.txt', build.name));
  assert.equal(build.version, pinned('worker/requirements-synthesis.txt', build.name));
  assert.match(
    build.url,
    new RegExp(`^https://files\\.pythonhosted\\.org/.+/${build.name}-${build.version}\\.tar\\.gz$`),
  );
  assert.match(build.sha256, /^[0-9a-f]{64}$/);
});

test('only Windows x64 builds from source', () => {
  assert.deepEqual(Object.keys(SOURCE_BUILDS), ['win32-x64']);
});
