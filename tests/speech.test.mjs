import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { parseSpeechInput, validateSpeechResult } from '../dist-core/speech/recognition.js';
import { SpeechCoordinator } from '../dist-core/speech/speech-coordinator.js';

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
});

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

test('model status is validated without claiming a verified runtime', async () => {
  const { parseSpeechStatus } = await import('../dist-core/speech/recognition.js');
  const missing = {
    available: false,
    code: 'MODEL_MISSING',
    model_id: null,
    languages: [],
    verified: false,
  };
  assert.deepEqual(parseSpeechStatus(missing), missing);
  for (const extra of [
    { available: true },
    { model_id: 'not-a-hash' },
    { languages: ['auto'] },
    { verified: 'yes' },
    { command: 'download' },
  ]) {
    assert.throws(() => parseSpeechStatus({ ...missing, ...extra }), /INVALID_WORKER_RESPONSE/);
  }
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
    await walk(new URL(`../dist-core/${entry}`, import.meta.url));
  assert.ok(visited.size > 5);
});
