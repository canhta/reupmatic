import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseDiagnosticLine,
  validateDiagnosticRecord,
} from '../../dist-core/diagnostics/diagnostic-record.js';
import { redact, scrubSecrets, stripQueryStrings } from '../../dist-core/diagnostics/redact.js';

const valid = {
  at: '2026-09-19T02:14:00.000Z',
  level: 'error',
  source: { process: 'worker', module: 'media/render' },
  event: 'worker.job-failed',
  message: 'ffmpeg exited 1',
  code: 'TOOL_FAILED',
  correlation: { job: 'job-1', batch: 'batch-7', project: 'project-3' },
  detail: { exit_code: 1, cancelled: false, tool: 'ffmpeg' },
};

test('a record validates with time, level, source, event, code and correlation', () => {
  assert.deepEqual(validateDiagnosticRecord(valid), valid);
});

test('correlation accepts only the existing domain identifiers', () => {
  for (const key of ['job', 'workflow_run', 'batch', 'content', 'project'])
    assert.equal(
      validateDiagnosticRecord({ ...valid, correlation: { [key]: 'x' } }).correlation[key],
      'x',
    );
  assert.throws(
    () => validateDiagnosticRecord({ ...valid, correlation: { trace: 'x' } }),
    /INVALID_DIAGNOSTIC/,
    'an invented trace/session identifier is refused',
  );
});

test('a malformed record is refused rather than written', () => {
  for (const broken of [
    null,
    [valid],
    { ...valid, at: 'yesterday' },
    { ...valid, level: 'trace' },
    { ...valid, source: { process: 'gpu', module: 'a' } },
    { ...valid, source: { process: 'main' } },
    { ...valid, event: 'Worker Job Failed' },
    { ...valid, code: 'tool_failed' },
    { ...valid, detail: { nested: { deep: 1 } } },
    { ...valid, detail: { infinite: Number.POSITIVE_INFINITY } },
  ])
    assert.throws(() => validateDiagnosticRecord(broken), /INVALID_DIAGNOSTIC/);
});

test('a malformed NDJSON line is dropped, not thrown', () => {
  assert.equal(parseDiagnosticLine('{"not":'), undefined);
  assert.equal(parseDiagnosticLine('   '), undefined);
  assert.equal(parseDiagnosticLine(JSON.stringify({ level: 'info' })), undefined);
  assert.equal(parseDiagnosticLine(JSON.stringify(valid)).event, 'worker.job-failed');
});

test('redaction removes credentials and untrusted content but keeps path and title', () => {
  const redacted = redact(
    validateDiagnosticRecord({
      ...valid,
      detail: {
        path: '/Users/reader/Movies/holiday.mp4',
        title: 'Summer trip to Đà Lạt',
        cookie: 'sessionid=abc123def; ttwid=xyz',
        access_token: 'sk-live-0000-secret',
        authorization: 'Bearer nope',
        password: 'hunter2',
        transcript: 'the speaker said something private',
        ocr_text: 'a burned-in caption',
        response_body: '{"aweme_detail":{"desc":"..."}}',
      },
    }),
  );
  const line = JSON.stringify(redacted);
  for (const leak of [
    'abc123def',
    'ttwid',
    'sk-live-0000-secret',
    'Bearer nope',
    'hunter2',
    'the speaker said something private',
    'a burned-in caption',
    'aweme_detail',
  ])
    assert.ok(!line.includes(leak), `redacted record still carries ${leak}`);
  assert.equal(redacted.detail.path, '/Users/reader/Movies/holiday.mp4');
  assert.equal(redacted.detail.title, 'Summer trip to Đà Lạt');
  assert.equal(redacted.code, 'TOOL_FAILED');
  assert.deepEqual(redacted.correlation, valid.correlation);
});

test('a URL keeps its page identity and loses its query string', () => {
  assert.equal(
    stripQueryStrings('https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=7&X-Bogus=SIG'),
    'https://www.douyin.com/aweme/v1/web/aweme/detail/',
  );
  const redacted = redact(
    validateDiagnosticRecord({
      ...valid,
      message: 'refused at https://sso.douyin.com/check?token=leaky&next=/',
      detail: { endpoint: 'https://example.test/a?b=c' },
    }),
  );
  assert.equal(redacted.message, 'refused at https://sso.douyin.com/check');
  assert.equal(redacted.detail.endpoint, 'https://example.test/a');
});

test('the renderer operation validates its entry and cannot claim another process', async () => {
  const { operations } = await import('../../dist-core/host-bridge/operations.js');
  const entry = operations['diagnostic-record'];
  assert.equal(entry.rendererMethod, 'recordDiagnostic');
  const validated = entry.validate({
    level: 'error',
    module: 'shell',
    event: 'renderer.uncaught-error',
    message: 'TypeError: x is not a function',
    correlation: { project: 'doc-1' },
    detail: { source: 'app://ui/index.js', line: 42 },
  });
  assert.deepEqual(validated, {
    level: 'error',
    module: 'shell',
    event: 'renderer.uncaught-error',
    message: 'TypeError: x is not a function',
    correlation: { project: 'doc-1' },
    detail: { source: 'app://ui/index.js', line: 42 },
  });
  // The wire shape carries no process at all, so a renderer payload cannot claim to be the
  // worker or the main process — the host stamps it.
  assert.throws(
    () => entry.validate({ level: 'error', module: 'shell', event: 'x.y', source: 'worker' }),
    /INVALID_REQUEST/,
  );
  assert.throws(() => entry.validate({ level: 'error', module: 'shell' }), /INVALID_DIAGNOSTIC/);
});

test('a credential written into free text is scrubbed, not only one under a named key', () => {
  for (const [text, leak] of [
    ['Set-Cookie: sessionid=abc123def; Path=/', 'abc123def'],
    ['Authorization: Bearer sk-live-0000-secret', 'sk-live-0000-secret'],
    ['GET https://reader:hunter2@example.test/a', 'hunter2'],
    ['refused, msToken=QQQzzz111 rejected', 'QQQzzz111'],
    ['x-signature: deadbeefcafe1234', 'deadbeefcafe1234'],
  ]) {
    assert.ok(!scrubSecrets(text).includes(leak), `free text still leaked ${leak}`);
  }
  // The debugging detail around the secret survives.
  assert.match(scrubSecrets('Set-Cookie: sessionid=abc; Path=/'), /Set-Cookie/);
  assert.equal(
    scrubSecrets('/Users/reader/Movies/holiday.mp4'),
    '/Users/reader/Movies/holiday.mp4',
  );
});

test('a message is scrubbed like any other field — it is the one nothing can key off', () => {
  const written = JSON.stringify(
    redact(
      validateDiagnosticRecord({
        ...valid,
        message: 'console.error: auth failed, cookie=ttwid%7Cabc123 token=sk-live-9',
        detail: {},
      }),
    ),
  );
  for (const leak of ['ttwid%7Cabc123', 'sk-live-9'])
    assert.ok(!written.includes(leak), `the message field leaked ${leak}`);
});
