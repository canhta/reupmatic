import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ClonedVoiceStore } from '../../dist-node/electron/features/speech/voice-store.js';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'reupmatic-speech-voices-'));
}

const draft = () => ({
  name: 'My voice',
  engine: 'vieneu-v3-turbo-onnx',
  language: 'vi',
  attested: true,
});
const data = () => ({
  speaker_emb: Array.from({ length: 192 }, (_, i) => (i % 7) - 3),
  ref_codes: [[1, 2, 3, 4]],
});

test('a cloned voice is persisted with its attestation and numeric payload, and listed by metadata only', async () => {
  const directory = await tempDir();
  const store = new ClonedVoiceStore(directory);
  const meta = await store.create(draft(), data());
  assert.match(meta.id, /^cloned_[a-f0-9]{16}$/);
  assert.equal(meta.name, 'My voice');
  assert.equal(meta.source, 'cloned');
  assert.equal(meta.engine, 'vieneu-v3-turbo-onnx');
  assert.match(meta.attested_at, /^\d{4}-\d{2}-\d{2}T/);
  const list = await store.list();
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], meta);
  // The list payload never carries the numeric payload; only the data accessor returns it.
  assert.ok(!JSON.stringify(list).includes('speaker_emb'));
  assert.deepEqual(await store.data(meta.id), data());
  await rm(directory, { recursive: true, force: true });
});

test('rename and remove act on one voice without disturbing its neighbours', async () => {
  const directory = await tempDir();
  const store = new ClonedVoiceStore(directory);
  const first = await store.create({ ...draft(), name: 'First' }, data());
  const second = await store.create({ ...draft(), name: 'Second' }, data());
  const renamed = await store.rename(first.id, 'Renamed');
  assert.equal(renamed.name, 'Renamed');
  assert.equal(renamed.attested_at, first.attested_at);
  await store.remove(second.id);
  const list = await store.list();
  assert.deepEqual(
    list.map((voice) => voice.name),
    ['Renamed'],
  );
  await assert.rejects(store.rename(second.id, 'Gone'), { code: 'SPEECH_VOICE_NOT_FOUND' });
  await assert.rejects(store.remove(second.id), { code: 'SPEECH_VOICE_NOT_FOUND' });
  await assert.rejects(store.data(second.id), { code: 'SPEECH_VOICE_NOT_FOUND' });
  await rm(directory, { recursive: true, force: true });
});

test('an unattested or malformed clone writes nothing at all', async () => {
  const directory = await tempDir();
  const store = new ClonedVoiceStore(directory);
  await assert.rejects(store.create({ ...draft(), attested: false }, data()), {
    code: 'SPEECH_CLONE_ATTESTATION_REQUIRED',
  });
  await assert.rejects(store.create(draft(), { speaker_emb: [0] * 192, ref_codes: [[1]] }), {
    code: 'SPEECH_CLONE_INVALID',
  });
  assert.deepEqual(await store.list(), []);
  assert.deepEqual(await readdir(directory).catch(() => []), []);
  await rm(directory, { recursive: true, force: true });
});

test('a corrupt store fails loudly rather than silently dropping voices', async () => {
  const directory = await tempDir();
  await writeFile(path.join(directory, 'voices.json'), '{"voices":[{"broken":true}]}');
  const store = new ClonedVoiceStore(directory);
  await assert.rejects(store.list(), { code: 'SPEECH_VOICE_STORE_INVALID' });
  await rm(directory, { recursive: true, force: true });
});

test('a renamed voice survives a fresh store instance reading the same directory', async () => {
  const directory = await tempDir();
  const store = new ClonedVoiceStore(directory);
  const meta = await store.create(draft(), data());
  await store.rename(meta.id, 'Persisted');
  const reopened = await new ClonedVoiceStore(directory).list();
  assert.equal(reopened[0].name, 'Persisted');
  assert.equal(reopened[0].id, meta.id);
  const raw = await readFile(path.join(directory, 'voices.json'), 'utf-8');
  assert.ok(!raw.includes('speaker_emb'));
  await rm(directory, { recursive: true, force: true });
});
