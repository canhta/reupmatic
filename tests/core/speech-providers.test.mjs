import assert from 'node:assert/strict';
import test from 'node:test';
import { presentableSpeechEngines } from '../../dist-core/speech/engine-capability.js';
import {
  assertProtocolImplemented,
  hostedEngineEntries,
  hostedModelIdentity,
  IMPLEMENTED_PROTOCOLS,
  parseModelDraft,
  parseProviderDraft,
  resolveHostedModel,
  VIENEU_CLOUD_HOST,
  vieuCloudModelId,
} from '../../dist-core/speech/providers.js';
import { parseSpeechStatus } from '../../dist-core/speech/recognition.js';

const providerDraft = () => ({
  display_name: 'My DashScope',
  protocol: 'dashscope',
  endpoint_host: 'dashscope.aliyuncs.com',
});
const modelDraft = () => ({
  remote_model_name: 'qwen-audio-3.0-asr-flash',
  languages: ['en', 'vi'],
  max_duration_ms: 600000,
});

test('a provider draft validates shape and rejects extra/missing/malformed fields', () => {
  assert.deepEqual(parseProviderDraft(providerDraft()), providerDraft());
  for (const patch of [
    { display_name: '' },
    { protocol: '' },
    { endpoint_host: '' },
    { endpoint_host: 'host/path' },
    { endpoint_host: 'host name' },
    { extra: 'field' },
  ]) {
    assert.throws(() => parseProviderDraft({ ...providerDraft(), ...patch }), /INVALID_REQUEST/);
  }
  assert.throws(() => parseProviderDraft('nope'), /INVALID_REQUEST/);
  assert.throws(() => parseProviderDraft(null), /INVALID_REQUEST/);
});

test('the shipped protocol registry names the implemented recognition and synthesis protocols', () => {
  assert.equal(IMPLEMENTED_PROTOCOLS.size, 2);
  assert.ok(IMPLEMENTED_PROTOCOLS.has('dashscope'));
  assert.ok(IMPLEMENTED_PROTOCOLS.has('vieneu'));
  assert.doesNotThrow(() => assertProtocolImplemented('dashscope'));
  assert.doesNotThrow(() => assertProtocolImplemented('vieneu'));
  assert.throws(() => assertProtocolImplemented('some-other-protocol'), /SPEECH_PROTOCOL_UNKNOWN/);
});

test('an unimplemented protocol is refused at configuration time, plainly; an implemented one is accepted', () => {
  const implemented = new Set(['dashscope']);
  assert.throws(
    () => assertProtocolImplemented('some-other-protocol', implemented),
    /SPEECH_PROTOCOL_UNKNOWN/,
  );
  assert.doesNotThrow(() => assertProtocolImplemented('dashscope', implemented));
});

test('the VieNeu cloud synthesis identity is a stable 64-hex digest tied to its endpoint', () => {
  const digest = vieuCloudModelId();
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(vieuCloudModelId(VIENEU_CLOUD_HOST), digest);
  assert.notEqual(vieuCloudModelId('other.example.com'), digest);
});

test('a model draft validates languages and a duration strictly below the local ceiling', () => {
  assert.deepEqual(parseModelDraft(modelDraft()), modelDraft());
  for (const patch of [
    { languages: [] },
    { languages: ['en', 'en'] },
    { languages: ['fr'] },
    { languages: ['en', 'vi', 'zh', 'en'] },
    { max_duration_ms: 0 },
    { max_duration_ms: 999 },
    { max_duration_ms: 7200000 }, // must be *shorter* than the 2h local ceiling, never equal
    { max_duration_ms: 8000000 },
    { max_duration_ms: 1.5 },
    { remote_model_name: '' },
  ]) {
    assert.throws(() => parseModelDraft({ ...modelDraft(), ...patch }), /INVALID_REQUEST/);
  }
});

test('the hosted identity digest is a stable 64-hex string, distinct across protocol/model/host', () => {
  const base = {
    protocol: 'dashscope',
    remote_model_name: 'flash',
    endpoint_host: 'a.example.com',
  };
  const digest = hostedModelIdentity(base);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(hostedModelIdentity(base), digest);
  assert.notEqual(hostedModelIdentity({ ...base, protocol: 'other' }), digest);
  assert.notEqual(hostedModelIdentity({ ...base, remote_model_name: 'other' }), digest);
  assert.notEqual(hostedModelIdentity({ ...base, endpoint_host: 'b.example.com' }), digest);
});

// The faster-whisper local pin (`worker/speech/recognition/models.py`) must survive this ticket
// unchanged; nothing here recomputes it, but the hosted digest's shape must never collide with
// it structurally (both are 64-hex, by construction, and that is the only shape either side's
// validators check).
test('the hosted digest keeps the 64-hex shape the faster-whisper pin already relies on', () => {
  const pin = 'ad7374bd46eb491fb99bafcd5674b82f3d61902712bc76696f43277e94268d1a';
  assert.match(pin, /^[a-f0-9]{64}$/);
  assert.match(
    hostedModelIdentity({ protocol: 'x', remote_model_name: 'y', endpoint_host: 'z' }),
    /^[a-f0-9]{64}$/,
  );
});

test('several providers, each with several models, all coexist as distinct engine entries', () => {
  const implemented = new Set(['dashscope']);
  const providers = [
    {
      id: 'provider-a',
      display_name: 'A',
      protocol: 'dashscope',
      endpoint_host: 'a.example.com',
      has_credential: true,
      models: [
        {
          id: 'model-a1',
          remote_model_name: 'flash',
          languages: ['en'],
          max_duration_ms: 60000,
          model_id: 'a'.repeat(64),
        },
        {
          id: 'model-a2',
          remote_model_name: 'pro',
          languages: ['vi'],
          max_duration_ms: 60000,
          model_id: 'b'.repeat(64),
        },
      ],
    },
    {
      id: 'provider-b',
      display_name: 'B',
      protocol: 'unimplemented-protocol',
      endpoint_host: 'b.example.com',
      has_credential: true,
      models: [
        {
          id: 'model-b1',
          remote_model_name: 'other',
          languages: ['zh'],
          max_duration_ms: 60000,
          model_id: 'c'.repeat(64),
        },
      ],
    },
  ];
  const entries = hostedEngineEntries(providers, implemented);
  assert.equal(entries.length, 3);
  assert.deepEqual(new Set(entries.map((entry) => entry.engine)).size, 3);
  const [a1, a2, b1] = entries;
  assert.equal(a1.available, true);
  assert.equal(a1.code, null);
  assert.equal(a2.available, true);
  assert.equal(b1.available, false);
  assert.equal(b1.code, 'SPEECH_PROTOCOL_UNKNOWN');
  // Adding provider B's entry never invalidated or replaced provider A's.
  assert.equal(a1.model_id, 'a'.repeat(64));
  assert.equal(a2.model_id, 'b'.repeat(64));
  // The merged list still satisfies the wire status validator unchanged.
  assert.doesNotThrow(() => parseSpeechStatus({ engines: entries }));
});

test('availability never depends on a credential — that gate lives only in presentableSpeechEngines', () => {
  const implemented = new Set(['dashscope']);
  const providers = [
    {
      id: 'p',
      display_name: 'P',
      protocol: 'dashscope',
      endpoint_host: 'p.example.com',
      has_credential: false,
      models: [
        {
          id: 'm',
          remote_model_name: 'flash',
          languages: ['en'],
          max_duration_ms: 60000,
          model_id: 'd'.repeat(64),
        },
      ],
    },
  ];
  const [entry] = hostedEngineEntries(providers, implemented);
  assert.equal(entry.available, true);
  // The engine list itself never asserts credential state; presentableSpeechEngines does.
  const status = { engines: [entry] };
  assert.equal(presentableSpeechEngines(status, () => false).length, 0);
  assert.equal(presentableSpeechEngines(status, () => true).length, 1);
});

test('presentableSpeechEngines never promotes an entry the worker/host reported unavailable', () => {
  const status = {
    engines: [
      {
        engine: 'p:m',
        available: false,
        code: 'SPEECH_PROTOCOL_UNKNOWN',
        model_id: 'e'.repeat(64),
        languages: ['en'],
        verified: false,
      },
    ],
  };
  assert.equal(presentableSpeechEngines(status, () => true).length, 0);
});

function providerWith(model, overrides = {}) {
  return {
    id: 'provider-1',
    display_name: 'P',
    protocol: 'dashscope',
    endpoint_host: 'p.example.com',
    has_credential: true,
    models: [model],
    ...overrides,
  };
}

test('resolveHostedModel finds the provider/model claiming a model_id, and null for anything else', () => {
  const model = {
    id: 'm1',
    remote_model_name: 'flash',
    languages: ['en'],
    max_duration_ms: 60000,
    model_id: 'f'.repeat(64),
  };
  const providers = [providerWith(model)];
  const found = resolveHostedModel(providers, 'f'.repeat(64), new Set(['dashscope']));
  assert.equal(found.provider.id, 'provider-1');
  assert.equal(found.model.id, 'm1');
  // A model_id naming a local bundle, or nothing configured at all, is not hosted.
  assert.equal(resolveHostedModel(providers, 'a'.repeat(64), new Set(['dashscope'])), null);
  assert.equal(resolveHostedModel([], 'f'.repeat(64), new Set(['dashscope'])), null);
});

test('resolveHostedModel re-refuses a stored provider whose protocol is no longer implemented', () => {
  const model = {
    id: 'm1',
    remote_model_name: 'flash',
    languages: ['en'],
    max_duration_ms: 60000,
    model_id: 'f'.repeat(64),
  };
  const providers = [providerWith(model, { protocol: 'retired-protocol' })];
  assert.throws(
    () => resolveHostedModel(providers, 'f'.repeat(64), new Set(['dashscope'])),
    /SPEECH_PROTOCOL_UNKNOWN/,
  );
});
