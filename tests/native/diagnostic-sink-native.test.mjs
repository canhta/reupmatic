import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createDiagnosticSink,
  retainedFiles,
} from '../../dist-node/electron/runtime/diagnostic-sink.js';

async function fixture(t, config = {}) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-diag-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let tick = 0;
  const sink = createDiagnosticSink({
    directory,
    now: () => new Date(Date.UTC(2026, 8, 19, 2, 14, 0) + tick++ * 1000),
    ...config,
  });
  return { directory, sink };
}

const entry = (over = {}) => ({
  level: 'info',
  source: { process: 'main', module: 'main' },
  event: 'app.started',
  ...over,
});

async function lines(directory, name = 'reupmatic-diagnostics.ndjson') {
  const contents = await readFile(path.join(directory, name), 'utf8');
  return contents.split('\n').filter(Boolean);
}

test('the sink appends one JSON object per line and stamps the time', async (t) => {
  const { directory, sink } = await fixture(t);
  sink.record(entry());
  sink.record(entry({ level: 'error', event: 'worker.job-failed', code: 'TOOL_FAILED' }));
  const written = (await lines(directory)).map((line) => JSON.parse(line));
  assert.equal(written.length, 2);
  assert.equal(written[0].at, '2026-09-19T02:14:00.000Z');
  assert.equal(written[1].code, 'TOOL_FAILED');
});

test('a record carrying a secret and a transcript keeps the path and title and nothing else', async (t) => {
  const { directory, sink } = await fixture(t);
  sink.record(
    entry({
      level: 'error',
      event: 'sources.detail-failed',
      detail: {
        path: '/Users/reader/Movies/holiday.mp4',
        title: 'Chuyến đi Đà Lạt',
        cookie: 'sessionid=abc123def',
        access_token: 'sk-live-secret-value',
        transcript: 'private speech content',
        page: 'https://www.douyin.com/video/7?with=signature',
      },
    }),
  );
  sink.close();
  const file = await readFile(path.join(directory, 'reupmatic-diagnostics.ndjson'), 'utf8');
  for (const leak of [
    'abc123def',
    'sk-live-secret-value',
    'private speech content',
    'signature',
    '?with=',
  ])
    assert.ok(!file.includes(leak), `the Diagnostic log leaked ${leak}`);
  assert.ok(file.includes('/Users/reader/Movies/holiday.mp4'));
  assert.ok(file.includes('Chuyến đi Đà Lạt'));
  assert.ok(file.includes('https://www.douyin.com/video/7'));
});

test('an invalid entry is dropped instead of corrupting the log', async (t) => {
  const { directory, sink } = await fixture(t);
  sink.record({ level: 'shout', source: { process: 'main', module: 'main' }, event: 'x' });
  sink.record(entry({ event: 'NOT A VALID EVENT' }));
  sink.record(entry());
  assert.equal((await lines(directory)).length, 1);
});

test('production level keeps debug out of the file; the environment can raise it', async (t) => {
  const quiet = await fixture(t);
  quiet.sink.record(entry({ level: 'debug', event: 'worker.chatter' }));
  quiet.sink.record(entry());
  assert.equal((await lines(quiet.directory)).length, 1);
  const verbose = await fixture(t, { level: 'debug' });
  verbose.sink.record(entry({ level: 'debug', event: 'worker.chatter' }));
  assert.equal((await lines(verbose.directory)).length, 1);
});

test('the log rotates at the size cap and retains only the five most recent files', async (t) => {
  const { directory, sink } = await fixture(t, { maxFileBytes: 400, retainedFiles: 5 });
  for (let index = 0; index < 60; index += 1)
    sink.record(entry({ event: 'app.started', message: `filler-${index}`.padEnd(120, 'x') }));
  const names = (await readdir(directory)).sort();
  assert.equal(names.length, 5, `expected five retained files, got ${names.join(', ')}`);
  assert.deepEqual(
    retainedFiles(directory).map((name) => path.basename(name)),
    [
      'reupmatic-diagnostics.ndjson',
      'reupmatic-diagnostics.ndjson.1',
      'reupmatic-diagnostics.ndjson.2',
      'reupmatic-diagnostics.ndjson.3',
      'reupmatic-diagnostics.ndjson.4',
    ],
  );
  // The newest file holds the newest records; nothing older than the window survives.
  const newest = await lines(directory);
  assert.ok(JSON.parse(newest.at(-1)).message.startsWith('filler-59'));
});

test('closing finalises the log; records offered afterwards are dropped, not buffered', async (t) => {
  const { directory, sink } = await fixture(t);
  sink.record(entry());
  sink.close();
  sink.close();
  sink.record(entry({ event: 'app.late' }));
  const written = (await lines(directory)).map((line) => JSON.parse(line));
  assert.deepEqual(
    written.map((record) => record.event),
    ['app.started', 'app.diagnostics-closed'],
  );
});

test('the support bundle carries the retained records and a non-sensitive system summary', async (t) => {
  const { directory, sink } = await fixture(t, { maxFileBytes: 400 });
  for (let index = 0; index < 8; index += 1)
    sink.record(entry({ event: 'app.started', message: `entry-${index}`.padEnd(120, 'x') }));
  sink.record(entry({ level: 'error', event: 'worker.job-failed', code: 'TOOL_FAILED' }));
  const destination = path.join(directory, 'support-bundle');
  const written = sink.exportBundle(destination, {
    app: '0.1.0',
    os: 'darwin 25.6.0',
    arch: 'arm64',
    runtime: { ffmpeg: 'available', python: '3.12.4' },
  });
  assert.equal(written.path, `${destination}.ndjson`);
  const records = (await readFile(written.path, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(records.length, written.records);
  assert.equal(records[0].event, 'support.bundle');
  assert.deepEqual(records[0].detail, {
    app: '0.1.0',
    os: 'darwin 25.6.0',
    arch: 'arm64',
    ffmpeg: 'available',
    python: '3.12.4',
  });
  assert.ok(records.some((record) => record.code === 'TOOL_FAILED'));
  // Oldest first, so the bundle reads forwards in time.
  const stamps = records.slice(1).map((record) => record.at);
  assert.deepEqual(stamps, [...stamps].sort());
});

test('a directory that cannot be written does not take the caller down', async (t) => {
  const { directory } = await fixture(t);
  const blocked = createDiagnosticSink({ directory: path.join(directory, 'missing\0name') });
  assert.doesNotThrow(() => blocked.record(entry()));
  assert.doesNotThrow(() => blocked.close());
});

test('the composition root finalises the sink before the recovery flush and keeps it out of the workspace', async () => {
  const main = await readFile(
    path.join(path.dirname(new URL(import.meta.url).pathname), '../../app/electron/main.ts'),
    'utf8',
  );
  // Assert inside the close-sequence `steps` array specifically: a plain indexOf over the whole
  // file matched the crash handler near the top and passed vacuously.
  const steps = main.slice(main.indexOf('steps: ['), main.indexOf('finalClose:'));
  const sinkClose = steps.indexOf('diagnostics.close()');
  const recoveryClose = steps.indexOf('recovery.close()');
  assert.ok(sinkClose > 0, 'the sink is not closed in the shutdown ordering at all');
  assert.ok(recoveryClose > 0, 'the recovery flush is not in the shutdown ordering');
  assert.ok(sinkClose < recoveryClose, 'the sink must be closed before the recovery flush');
  // A crash hook records; it must not close, or every later record in the session is dropped.
  const hooks = main.slice(
    main.indexOf("process.on('uncaughtException'"),
    main.indexOf('async function start'),
  );
  assert.ok(!hooks.includes('diagnostics.close()'), 'a crash hook must not mute the sink');
  // The Diagnostic log lives under the OS log directory, never the workspace, so a project,
  // profile or workspace export can never sweep it up.
  assert.match(main, /createDiagnosticSink\(\{\s*directory: app\.getPath\('logs'\)/);
  assert.ok(!/createDiagnosticSink\([^)]*workspace/s.test(main));
});
