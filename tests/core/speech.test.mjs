import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { parseSpeechInput, validateSpeechResult } from '../../dist-core/speech/recognition.js';
import { SpeechCoordinator } from '../../dist-core/speech/speech-coordinator.js';

const hash = 'a'.repeat(64),
  model = 'b'.repeat(64);
const input = () => ({
  request_id: 'speech-12345678',
  revision: 7,
  params: { asset_id: 'asset-123', start_ms: 1000, end_ms: 3000, language: 'vi', model_id: model },
});
const result = () => ({
  kind: 'stt',
  asset_id: 'asset-123',
  source_sha256: hash,
  start_ms: 1000,
  end_ms: 3000,
  language: 'vi',
  model_id: model,
  runtime: 'test-adapter',
  clock: 'source',
  timing: 'segment',
  cues: [{ id: 'stt-1', start_ms: 1200, end_ms: 1800, text: 'Xin chào' }],
  words: [],
  aligner_model_id: null,
});
const aligner = 'c'.repeat(64);

class Port extends EventEmitter {
  request(method, params, revision) {
    this.method = method;
    this.params = params;
    this.revision = revision;
    this.result = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    return {
      id: 'internal-1',
      result: this.result,
      cancel: async () => {
        this.cancelled = true;
      },
    };
  }
}

test('speech requests are bounded, explicit-language, local-model and reject extra fields', () => {
  assert.deepEqual(parseSpeechInput(input()), input());
  for (const patch of [
    { language: 'auto' },
    { language: ['vi'] },
    { start_ms: -1 },
    { end_ms: 8000000 },
    { model_id: 'small' },
    { path: '/unowned.mp4' },
    { start_ms: 1.5 },
  ]) {
    assert.throws(() => parseSpeechInput({ ...input(), params: { ...input().params, ...patch } }));
  }
});

test('results correlate source, language, model, time range and bounded plain cues', () => {
  assert.deepEqual(validateSpeechResult(result(), input(), hash), result());
  for (const patch of [
    { source_sha256: model },
    { model_id: hash },
    { language: 'en' },
    { clock: 'output' },
    { path: '/private' },
    { cues: [{ ...result().cues[0], end_ms: 5000 }] },
    { cues: [{ ...result().cues[0], style: {} }] },
  ]) {
    assert.throws(
      () => validateSpeechResult({ ...result(), ...patch }, input(), hash),
      /INVALID_WORKER_RESPONSE/,
    );
  }
  assert.deepEqual(validateSpeechResult({ ...result(), cues: [] }, input(), hash).cues, []);
});

test('word timings never touch cue shape and stay ordered, bounded and provenanced', () => {
  const withWords = {
    ...result(),
    words: [
      { cue_id: 'stt-1', start_ms: 1200, end_ms: 1400, text: 'Xin' },
      { cue_id: 'stt-1', start_ms: 1400, end_ms: 1800, text: 'chào' },
    ],
    aligner_model_id: aligner,
  };
  const validated = validateSpeechResult(withWords, input(), hash);
  assert.deepEqual(validated.words, withWords.words);
  assert.deepEqual(validated.cues, result().cues);
  assert.deepEqual(validateSpeechResult(result(), input(), hash).words, []);
  for (const patch of [
    { words: withWords.words, aligner_model_id: null },
    {
      words: [{ cue_id: 'stt-1', start_ms: 1700, end_ms: 1900, text: 'chào' }],
      aligner_model_id: aligner,
    },
    {
      words: [
        { cue_id: 'stt-1', start_ms: 1400, end_ms: 1600, text: 'chào' },
        { cue_id: 'stt-1', start_ms: 1200, end_ms: 1400, text: 'Xin' },
      ],
      aligner_model_id: aligner,
    },
    {
      words: [{ cue_id: 'stt-2', start_ms: 1200, end_ms: 1400, text: 'Xin' }],
      aligner_model_id: aligner,
    },
    {
      words: [{ ...withWords.words[0], style: {} }],
      aligner_model_id: aligner,
    },
    { aligner_model_id: 'not-a-hash' },
    { words: 'not-an-array' },
  ]) {
    assert.throws(
      () => validateSpeechResult({ ...result(), ...patch }, input(), hash),
      /INVALID_WORKER_RESPONSE/,
    );
  }
});

test('an unsegmented engine validates multiple ordered cues that rebuild its transcript', () => {
  const derived = {
    ...result(),
    cues: [
      { id: 'stt-1', start_ms: 1000, end_ms: 1900, text: 'Xin chào ' },
      { id: 'stt-2', start_ms: 2000, end_ms: 3000, text: 'Việt Nam' },
    ],
    words: [
      { cue_id: 'stt-1', start_ms: 1000, end_ms: 1400, text: 'Xin' },
      { cue_id: 'stt-1', start_ms: 1400, end_ms: 1900, text: 'chào' },
      { cue_id: 'stt-2', start_ms: 2000, end_ms: 2400, text: 'Việt' },
      { cue_id: 'stt-2', start_ms: 2400, end_ms: 2800, text: 'Nam' },
    ],
    aligner_model_id: aligner,
  };
  const validated = validateSpeechResult(derived, input(), hash);
  assert.deepEqual(validated.cues, derived.cues);
  assert.equal(validated.cues.map((cue) => cue.text).join(''), 'Xin chào Việt Nam');
  for (const patch of [
    {
      cues: [
        { id: 'stt-1', start_ms: 1000, end_ms: 2500, text: 'Xin chào ' },
        { id: 'stt-2', start_ms: 2000, end_ms: 3000, text: 'Việt Nam' },
      ],
      words: derived.words,
      aligner_model_id: aligner,
    },
    {
      cues: derived.cues,
      words: [{ cue_id: 'stt-9', start_ms: 1000, end_ms: 1400, text: 'Xin' }],
      aligner_model_id: aligner,
    },
  ]) {
    assert.throws(
      () => validateSpeechResult({ ...result(), ...patch }, input(), hash),
      /INVALID_WORKER_RESPONSE/,
    );
  }
});

test('speech admission uses existing worker queue and maps early terminal results to public IDs', async () => {
  const port = new Port(),
    coordinator = new SpeechCoordinator(port),
    messages = [];
  coordinator.on('job', (message) => messages.push(message));
  const ticket = coordinator.start(input(), hash);
  assert.equal(port.method, 'speech.transcribe');
  assert.equal(port.params.source_sha256, hash);
  port.emit('message', {
    v: 1,
    id: 'internal-1',
    revision: 7,
    event: 'progress',
    data: { phase: 'speechRecognizing', fraction: 0.5 },
  });
  port.resolve(result());
  assert.deepEqual(await ticket.result, result());
  assert.equal(messages.at(-1).id, input().request_id);
  assert.equal(messages.at(-1).event, 'result');
  assert.equal(coordinator.activeCount, 0);
  assert.throws(() => coordinator.start(input(), hash), /DUPLICATE_REQUEST/);
  await coordinator.close();
});

test('cancelled inference never publishes a late successful result', async () => {
  const port = new Port(),
    coordinator = new SpeechCoordinator(port),
    messages = [];
  coordinator.on('job', (message) => messages.push(message));
  const ticket = coordinator.start(input(), hash);
  await ticket.cancel();
  assert.equal(port.cancelled, true);
  port.resolve(result());
  await assert.rejects(ticket.result, /CANCELLED/);
  assert.equal(
    messages.some((message) => message.event === 'result'),
    false,
  );
  assert.equal(messages.at(-1).data.code, 'CANCELLED');
  await coordinator.close();
});

const hostedModel = 'f'.repeat(64);
const hostedInput = () => ({
  request_id: 'speech-hosted01',
  revision: 3,
  params: {
    asset_id: 'asset-123',
    start_ms: 1000,
    end_ms: 3000,
    language: 'vi',
    model_id: hostedModel,
  },
});
function fakeProviders({ maxDurationMs = 60000, withCredential = true } = {}) {
  const credential = 'top-secret';
  return {
    async listProviders() {
      return [
        {
          id: 'provider-1',
          display_name: 'P',
          protocol: 'dashscope',
          endpoint_host: 'p.example.com',
          has_credential: withCredential,
          models: [
            {
              id: 'model-1',
              remote_model_name: 'flash',
              languages: ['vi'],
              max_duration_ms: maxDurationMs,
              model_id: hostedModel,
            },
          ],
        },
      ];
    },
    async credentialEnv() {
      return withCredential ? { REUPMATIC_SPEECH_PROVIDER_CREDENTIAL: credential } : undefined;
    },
  };
}

/** One real timer callback drains the whole microtask queue, so one await suffices. */
function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('a hosted model_id routes to the worker with the job provider config and credential attached', async () => {
  const port = new Port(),
    coordinator = new SpeechCoordinator(port, fakeProviders());
  const ticket = coordinator.start(hostedInput(), hash);
  await flushMicrotasks();
  assert.equal(port.method, 'speech.transcribe');
  assert.deepEqual(port.params.provider, {
    protocol: 'dashscope',
    endpoint_host: 'p.example.com',
    remote_model_name: 'flash',
    max_duration_ms: 60000,
  });
  assert.equal(port.params.credential, 'top-secret');
  assert.equal(port.params.REUPMATIC_SPEECH_PROVIDER_CREDENTIAL, undefined);
  port.resolve({
    ...result(),
    asset_id: 'asset-123',
    model_id: hostedModel,
    start_ms: 1000,
    end_ms: 3000,
  });
  await ticket.result;
  await coordinator.close();
});

test('a hosted request over its model’s own duration bound is refused before the worker is asked', async () => {
  const port = new Port(),
    coordinator = new SpeechCoordinator(port, fakeProviders({ maxDurationMs: 1000 }));
  const ticket = coordinator.start(hostedInput(), hash); // 2000ms of requested audio
  await assert.rejects(ticket.result, /SPEECH_CLOUD_LIMIT/);
  assert.equal(port.method, undefined);
  await coordinator.close();
});

test('a hosted model with no stored credential is refused rather than dispatched without one', async () => {
  const port = new Port(),
    coordinator = new SpeechCoordinator(port, fakeProviders({ withCredential: false }));
  const ticket = coordinator.start(hostedInput(), hash);
  await assert.rejects(ticket.result, /MODEL_MISSING/);
  assert.equal(port.method, undefined);
  await coordinator.close();
});

test('a local model_id is dispatched unchanged even when a provider lookup is configured', async () => {
  const port = new Port(),
    coordinator = new SpeechCoordinator(port, fakeProviders());
  const ticket = coordinator.start(input(), hash); // input()'s model_id matches no provider
  await flushMicrotasks();
  assert.equal(port.method, 'speech.transcribe');
  assert.equal(port.params.provider, undefined);
  assert.equal(port.params.credential, undefined);
  port.resolve(result());
  await ticket.result;
  await coordinator.close();
});

test('model status is a list of engines, validated without claiming a verified runtime', async () => {
  const { parseSpeechStatus } = await import('../../dist-core/speech/recognition.js');
  const missing = {
    engine: 'faster-whisper',
    available: false,
    code: 'MODEL_MISSING',
    model_id: null,
    languages: [],
    verified: false,
  };
  assert.deepEqual(parseSpeechStatus({ engines: [missing] }), { engines: [missing] });
  for (const extra of [
    { available: true },
    { model_id: 'not-a-hash' },
    { languages: ['auto'] },
    { verified: 'yes' },
    { command: 'download' },
    { engine: '' },
  ]) {
    assert.throws(
      () => parseSpeechStatus({ engines: [{ ...missing, ...extra }] }),
      /INVALID_WORKER_RESPONSE/,
    );
  }
  assert.throws(() => parseSpeechStatus(missing), /INVALID_WORKER_RESPONSE/);
  assert.throws(
    () => parseSpeechStatus({ engines: [missing, missing] }),
    /INVALID_WORKER_RESPONSE/,
  );
});

test('the capability seam offers local engines whenever available, never a worker-unavailable one', async () => {
  const { presentableSpeechEngines } = await import('../../dist-core/speech/engine-capability.js');
  const available = (engine, overrides = {}) => ({
    engine,
    available: true,
    code: null,
    model_id: 'b'.repeat(64),
    languages: ['vi'],
    verified: false,
    ...overrides,
  });
  const unavailable = (engine) => ({
    engine,
    available: false,
    code: 'MODEL_MISSING',
    model_id: null,
    languages: [],
    verified: false,
  });
  assert.deepEqual(
    presentableSpeechEngines({
      engines: [available('faster-whisper'), available('dashscope-flash')],
    }),
    [available('faster-whisper')],
  );
  assert.deepEqual(presentableSpeechEngines({ engines: [unavailable('faster-whisper')] }), []);
  const hosted = { engines: [available('dashscope-flash')] };
  assert.deepEqual(presentableSpeechEngines(hosted), []);
  assert.deepEqual(
    presentableSpeechEngines(hosted, (engine) => engine === 'dashscope-flash'),
    [available('dashscope-flash')],
  );
  assert.deepEqual(
    presentableSpeechEngines({ engines: [unavailable('dashscope-flash')] }, () => true),
    [],
  );
});

test('offered engines for a job narrow the capability seam by language, never widen it', async () => {
  const { offeredSpeechEngines } = await import('../../dist-core/speech/engine-capability.js');
  const available = (engine, overrides = {}) => ({
    engine,
    available: true,
    code: null,
    model_id: 'b'.repeat(64),
    languages: ['vi'],
    verified: false,
    ...overrides,
  });
  const unavailable = (engine) => ({
    engine,
    available: false,
    code: 'MODEL_MISSING',
    model_id: null,
    languages: [],
    verified: false,
  });
  const status = {
    engines: [
      available('faster-whisper', { languages: ['en', 'vi'] }),
      available('dashscope-flash', { languages: ['vi'] }),
    ],
  };
  assert.deepEqual(offeredSpeechEngines(status, 'en'), [
    available('faster-whisper', { languages: ['en', 'vi'] }),
  ]);
  assert.deepEqual(offeredSpeechEngines(status, 'zh'), []);
  assert.deepEqual(offeredSpeechEngines({ engines: [unavailable('faster-whisper')] }, 'en'), []);
  const hosted = { engines: [available('dashscope-flash', { languages: ['en'] })] };
  assert.deepEqual(offeredSpeechEngines(hosted, 'en'), []);
  assert.deepEqual(
    offeredSpeechEngines(hosted, 'en', (engine) => engine === 'dashscope-flash'),
    [available('dashscope-flash', { languages: ['en'] })],
  );
});

test('renderer-safe speech and text commands never import the Node worker process adapter', async () => {
  const { readFile } = await import('node:fs/promises');
  const visited = new Set();
  async function walk(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    const text = await readFile(url, 'utf8');
    for (const match of text.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) {
      assert.ok(
        match[1].startsWith('.'),
        `Unexpected platform import in ${url.pathname}: ${match[1]}`,
      );
      await walk(new URL(match[1], url));
    }
  }
  for (const entry of [
    'speech/recognition.js',
    'subtitles/layers/commands.js',
    'projects/editor-history.js',
    'editing/composition/snapshot.js',
  ])
    await walk(new URL(`../../dist-core/${entry}`, import.meta.url));
  assert.ok(visited.size > 5);
});

test('the failure a job reports names the language when engines work but none serves it', async () => {
  const { speechProblemCode } = await import('../../dist-core/speech/engine-capability.js');
  const engine = (overrides = {}) => ({
    engine: 'faster-whisper',
    available: true,
    code: null,
    model_id: 'c'.repeat(64),
    languages: ['en'],
    verified: false,
    ...overrides,
  });

  assert.equal(speechProblemCode(null, 'en'), 'MODEL_MISSING');
  assert.equal(speechProblemCode({ engines: [] }, 'en'), 'MODEL_MISSING');

  assert.equal(
    speechProblemCode(
      { engines: [engine({ available: false, code: 'MODEL_RUNTIME_MISSING' })] },
      'en',
    ),
    'MODEL_RUNTIME_MISSING',
  );

  assert.equal(
    speechProblemCode(
      {
        engines: [
          engine({
            engine: 'faster-whisper',
            available: false,
            code: 'MODEL_MISSING',
            model_id: null,
            languages: [],
          }),
          engine({ engine: 'dashscope-flash', available: false, code: 'MODEL_RUNTIME_MISSING' }),
        ],
      },
      'en',
    ),
    'MODEL_RUNTIME_MISSING',
  );

  assert.equal(
    speechProblemCode({ engines: [engine({ languages: ['en'] })] }, 'zh'),
    'MODEL_LANGUAGE_UNAVAILABLE',
  );
  assert.equal(
    speechProblemCode({ engines: [engine({ languages: ['vi'] })] }, 'en'),
    'MODEL_LANGUAGE_UNAVAILABLE',
  );

  assert.equal(
    speechProblemCode(
      { engines: [engine({ engine: 'dashscope-flash', languages: ['en'] })] },
      'zh',
    ),
    'MODEL_MISSING',
  );
});
