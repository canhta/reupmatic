import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  describeLocalBundle,
  SYNTHESIS_ENGINE,
  writeLocalBundleDescriptor,
} from '../../dist-core/speech/local-bundle.js';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function bundle(root) {
  const directory = path.join(root, 'bundle');
  await mkdir(path.join(directory, 'onnx'), { recursive: true });
  await mkdir(path.join(directory, 'codec'), { recursive: true });
  await writeFile(path.join(directory, 'onnx', 'graph.onnx'), 'graph');
  await writeFile(path.join(directory, 'codec', 'decoder.onnx'), 'decoder');
  await writeFile(path.join(directory, 'voices.json'), '{"voices":[]}');
  return directory;
}

test('a user bundle is described with the same record shape a download writes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'local-bundle-'));
  try {
    const directory = await bundle(root);
    const descriptor = await describeLocalBundle(directory, SYNTHESIS_ENGINE, ['en', 'vi']);
    assert.equal(descriptor.engine, 'vieneu-v3-turbo-onnx');
    assert.equal(descriptor.directory, await realpath(directory));
    assert.deepEqual(descriptor.languages, ['en', 'vi']);
    assert.deepEqual(descriptor.files, {
      'onnx/graph.onnx': sha256(Buffer.from('graph')),
      'codec/decoder.onnx': sha256(Buffer.from('decoder')),
      'voices.json': sha256(Buffer.from('{"voices":[]}')),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a symlinked file is refused rather than hashed through', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'local-bundle-'));
  try {
    const directory = await bundle(root);
    const outside = path.join(root, 'outside.bin');
    await writeFile(outside, 'outside');
    await symlink(outside, path.join(directory, 'onnx', 'linked.onnx'));
    await assert.rejects(
      () => describeLocalBundle(directory, SYNTHESIS_ENGINE, ['vi']),
      /SYNTHESIS_MANIFEST_INVALID/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('writing a descriptor is atomic and leaves no temporary record behind', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'local-bundle-'));
  try {
    const directory = await bundle(root);
    const target = path.join(root, 'speech-models', 'local-synthesis.json');
    const descriptor = await writeLocalBundleDescriptor(target, directory, SYNTHESIS_ENGINE, [
      'en',
      'vi',
    ]);
    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), descriptor);
    assert.deepEqual(await readdir(path.join(root, 'speech-models')), ['local-synthesis.json']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a file path is not a bundle folder', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'local-bundle-'));
  try {
    const file = path.join(root, 'not-a-folder.json');
    await writeFile(file, '{}');
    await assert.rejects(
      () => describeLocalBundle(file, SYNTHESIS_ENGINE, ['vi']),
      /SYNTHESIS_MANIFEST_INVALID/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a folder picked by mistake is refused rather than walked to the end', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'local-bundle-'));
  try {
    // Deeper than a bundle's own onnx/ + codec/ layout ever goes.
    const deep = path.join(root, 'a/b/c/d/e/f/g/h/i');
    await mkdir(deep, { recursive: true });
    await writeFile(path.join(deep, 'weights.bin'), 'x');
    await assert.rejects(
      () => describeLocalBundle(root, SYNTHESIS_ENGINE, ['en', 'vi']),
      /SYNTHESIS_MANIFEST_INVALID/,
    );

    const many = path.join(root, 'many');
    await mkdir(many, { recursive: true });
    await Promise.all(
      Array.from({ length: 513 }, (_, index) =>
        writeFile(path.join(many, `file-${index}.bin`), 'x'),
      ),
    );
    await assert.rejects(
      () => describeLocalBundle(many, SYNTHESIS_ENGINE, ['en', 'vi']),
      /SYNTHESIS_MANIFEST_INVALID/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
