import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SpeechProviderStore } from '../../dist-node/electron/features/speech/provider-store.js';

// A minimal, real transform (not identity) so a test can tell the store actually encrypted a
// credential rather than writing it through unchanged. Real callers pass Electron's actual
// `safeStorage`; this file never imports `electron` at all (see provider-store.ts's own doc
// comment on why), so this suite runs under plain `node --test`.
function fakeEncryption({ available = true } = {}) {
  const KEY = 0x5a;
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => {
      const bytes = Buffer.from(value, 'utf-8');
      for (let i = 0; i < bytes.length; i += 1) bytes[i] ^= KEY;
      return Buffer.concat([Buffer.from('fake:'), bytes]);
    },
    decryptString: (value) => {
      const bytes = Buffer.from(value.subarray(5));
      for (let i = 0; i < bytes.length; i += 1) bytes[i] ^= KEY;
      return bytes.toString('utf-8');
    },
  };
}

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'reupmatic-speech-providers-'));
}

const draft = () => ({
  display_name: 'My DashScope',
  protocol: 'dashscope',
  endpoint_host: 'dashscope.aliyuncs.com',
});
const modelDraft = () => ({
  remote_model_name: 'qwen-audio-3.0-asr-flash',
  languages: ['en', 'vi'],
  max_duration_ms: 600000,
});

test('several providers and several models per provider coexist; adding one never invalidates another', async () => {
  const directory = await tempDir();
  const store = new SpeechProviderStore(
    directory,
    fakeEncryption(),
    new Set(['dashscope', 'other']),
  );
  const a = await store.addProvider(draft(), 'secret-a');
  const b = await store.addProvider(
    { ...draft(), display_name: 'Other', protocol: 'other' },
    'secret-b',
  );
  await store.addModel(a.id, modelDraft());
  await store.addModel(a.id, { ...modelDraft(), remote_model_name: 'second-model' });
  const list = await store.list();
  assert.equal(list.length, 2);
  const providerA = list.find((p) => p.id === a.id);
  const providerB = list.find((p) => p.id === b.id);
  assert.equal(providerA.models.length, 2);
  assert.equal(providerB.models.length, 0);
  assert.equal(providerA.has_credential, true);
  assert.equal(providerB.has_credential, true);
  assert.match(providerA.models[0].model_id, /^[a-f0-9]{64}$/);
  assert.notEqual(providerA.models[0].model_id, providerA.models[1].model_id);
  await rm(directory, { recursive: true, force: true });
});

test('editing and removing a provider works; removing a provider removes its stored credential', async () => {
  const directory = await tempDir();
  const store = new SpeechProviderStore(directory, fakeEncryption(), new Set(['dashscope']));
  const provider = await store.addProvider(draft(), 'top-secret');
  const updated = await store.updateProvider(provider.id, { ...draft(), display_name: 'Renamed' });
  assert.equal(updated.display_name, 'Renamed');
  assert.equal(updated.has_credential, true);
  assert.deepEqual(await store.credentialEnv(provider.id), {
    REUPMATIC_SPEECH_PROVIDER_CREDENTIAL: 'top-secret',
  });
  await store.removeProvider(provider.id);
  assert.deepEqual(await store.list(), []);
  assert.equal(await store.credentialEnv(provider.id), undefined);
  await rm(directory, { recursive: true, force: true });
});

test('editing and removing a model works, independent of its provider or sibling models', async () => {
  const directory = await tempDir();
  const store = new SpeechProviderStore(directory, fakeEncryption(), new Set(['dashscope']));
  const provider = await store.addProvider(draft(), 'secret');
  const afterAdd = await store.addModel(provider.id, modelDraft());
  const [model] = afterAdd.models;
  const afterUpdate = await store.updateModel(provider.id, model.id, {
    ...modelDraft(),
    remote_model_name: 'renamed-model',
  });
  assert.equal(afterUpdate.models[0].remote_model_name, 'renamed-model');
  assert.equal(afterUpdate.models[0].id, model.id);
  const afterRemove = await store.removeModel(provider.id, model.id);
  assert.deepEqual(afterRemove.models, []);
  await rm(directory, { recursive: true, force: true });
});

test('a protocol the app does not implement is refused at configuration time, before anything is written', async () => {
  const directory = await tempDir();
  const store = new SpeechProviderStore(directory, fakeEncryption(), new Set(['dashscope']));
  await assert.rejects(store.addProvider({ ...draft(), protocol: 'made-up' }, 'secret'), {
    code: 'SPEECH_PROTOCOL_UNKNOWN',
  });
  assert.deepEqual(await store.list(), []);
  const entries = await readdir(directory).catch(() => []);
  assert.deepEqual(entries, []);
  const provider = await store.addProvider(draft(), 'secret');
  await assert.rejects(store.updateProvider(provider.id, { ...draft(), protocol: 'made-up' }), {
    code: 'SPEECH_PROTOCOL_UNKNOWN',
  });
  await rm(directory, { recursive: true, force: true });
});

test('unavailable OS-backed encryption refuses plainly, never falls back to plaintext, and writes nothing', async () => {
  const directory = await tempDir();
  const store = new SpeechProviderStore(
    directory,
    fakeEncryption({ available: false }),
    new Set(['dashscope']),
  );
  await assert.rejects(store.addProvider(draft(), 'secret'), {
    code: 'CREDENTIAL_ENCRYPTION_UNAVAILABLE',
  });
  assert.deepEqual(await store.list(), []);
  const entries = await readdir(directory).catch(() => []);
  assert.deepEqual(entries, [], 'nothing — not even the non-secret provider entry — is written');

  const available = new SpeechProviderStore(directory, fakeEncryption(), new Set(['dashscope']));
  const provider = await available.addProvider(draft(), 'secret');
  const unavailable = new SpeechProviderStore(
    directory,
    fakeEncryption({ available: false }),
    new Set(['dashscope']),
  );
  await assert.rejects(unavailable.setCredential(provider.id, 'new-secret'), {
    code: 'CREDENTIAL_ENCRYPTION_UNAVAILABLE',
  });
  await rm(directory, { recursive: true, force: true });
});

// The point of this ticket. A credential must never reach a log line, an error message, the
// non-secret provider store file, or any status payload the store returns.
test('a credential never reaches a log line, an error message, the provider store file or a status payload', async () => {
  const directory = await tempDir();
  const secret = 'sk-super-secret-credential-value-do-not-leak';
  const logs = [];
  const originals = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  };
  for (const key of Object.keys(originals)) {
    console[key] = (...args) => logs.push(args.map(String).join(' '));
  }
  try {
    const store = new SpeechProviderStore(directory, fakeEncryption(), new Set(['dashscope']));
    const provider = await store.addProvider(draft(), secret);
    await store.addModel(provider.id, modelDraft());
    await store.updateProvider(provider.id, { ...draft(), display_name: 'Renamed' });
    await store.setCredential(provider.id, `${secret}-replacement`);

    // Deliberately trigger every error path this store has, with the secret still stored.
    const failures = await Promise.allSettled([
      store.addProvider({ ...draft(), protocol: 'unknown' }, secret),
      store.updateProvider('missing-id', draft()),
      store.addModel('missing-id', modelDraft()),
      store.updateModel(provider.id, 'missing-model', modelDraft()),
      store.removeModel(provider.id, 'missing-model'),
    ]);
    for (const failure of failures) {
      assert.equal(failure.status, 'rejected');
      assert.ok(!String(failure.reason?.message ?? '').includes(secret));
      assert.ok(!String(failure.reason?.code ?? '').includes(secret));
    }

    // The status payload a caller actually sees.
    const list = await store.list();
    assert.ok(!JSON.stringify(list).includes(secret));

    // The one non-secret file this store writes to disk.
    const stored = await readFile(path.join(directory, 'providers.json'), 'utf-8');
    assert.ok(!stored.includes(secret));

    // The encrypted blob is not the plaintext credential either.
    const files = await readdir(directory);
    const credentialFile = files.find((name) => name.endsWith('.credential'));
    assert.ok(credentialFile, 'a credential file was written');
    const raw = await readFile(path.join(directory, credentialFile));
    assert.ok(!raw.toString('latin1').includes(secret));

    // Nothing anywhere logged the secret, across every operation above, success or failure.
    assert.ok(!logs.some((line) => line.includes(secret)));
  } finally {
    for (const [key, fn] of Object.entries(originals)) console[key] = fn;
    await rm(directory, { recursive: true, force: true });
  }
});

test('credentialEnv is the only way a credential leaves the store, and only through an env-shaped object', async () => {
  const directory = await tempDir();
  const store = new SpeechProviderStore(directory, fakeEncryption(), new Set(['dashscope']));
  const provider = await store.addProvider(draft(), 'child-env-secret');
  const env = await store.credentialEnv(provider.id);
  assert.deepEqual(Object.keys(env), ['REUPMATIC_SPEECH_PROVIDER_CREDENTIAL']);
  assert.equal(env.REUPMATIC_SPEECH_PROVIDER_CREDENTIAL, 'child-env-secret');
  await store.removeCredential(provider.id);
  assert.equal(await store.credentialEnv(provider.id), undefined);
  const list = await store.list();
  assert.equal(list[0].has_credential, false);
  await rm(directory, { recursive: true, force: true });
});
