import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CORRELATION_KEYS,
  DIAGNOSTIC_LEVELS,
} from '../../dist-core/diagnostics/diagnostic-record.js';
import { WorkerClient } from '../../dist-core/worker/worker-client.js';
import { createDiagnosticSink } from '../../dist-node/electron/runtime/diagnostic-sink.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function pythonTuple(source, name) {
  const match = source.match(new RegExp(`${name}\\s*=\\s*\\(([^)]*)\\)`, 's'));
  assert.ok(match, `could not find ${name} in worker/runtime/diagnostics.py`);
  return [...match[1].matchAll(/"([a-z_]+)"/g)].map((entry) => entry[1]);
}

test('the TypeScript record contract and the Python emitter agree on the record shape', async () => {
  const source = await readFile(path.join(root, 'worker', 'runtime', 'diagnostics.py'), 'utf8');
  assert.deepEqual(pythonTuple(source, 'LEVELS'), [...DIAGNOSTIC_LEVELS]);
  assert.deepEqual(pythonTuple(source, 'CORRELATION_KEYS'), [...CORRELATION_KEYS]);
  assert.deepEqual(pythonTuple(source, 'FIELDS'), [
    'at',
    'level',
    'source',
    'event',
    'message',
    'code',
    'correlation',
    'detail',
  ]);
  assert.match(source, /PROCESS = "worker"/);
});

/**
 * A scripted stand-in for `worker/main.py`: it writes the given lines to stderr and then idles
 * on stdin, so the real `WorkerClient` reader is what is under test, not a copy of it.
 */
async function scriptedWorker(t, lines) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-wc-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const script = path.join(directory, 'scripted-worker.py');
  await writeFile(
    script,
    [
      'import sys',
      `for line in ${JSON.stringify(lines)}:`,
      '    print(line, file=sys.stderr)',
      'sys.stderr.flush()',
      'sys.stdin.read()',
      '',
    ].join('\n'),
  );
  const sink = createDiagnosticSink({ directory });
  const python = process.env.PYTHON ?? path.join(root, '.venv', 'bin', 'python');
  const client = new WorkerClient(python, script, directory, sink);
  return { directory, sink, client };
}

async function writtenRecords(directory) {
  const contents = await readFile(path.join(directory, 'reupmatic-diagnostics.ndjson'), 'utf8');
  return contents
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('a malformed stderr line is dropped without corrupting the stream', async (t) => {
  const good = {
    at: '2026-09-19T02:14:00.000Z',
    level: 'error',
    source: { process: 'worker', module: 'runtime' },
    event: 'worker.job-failed',
    code: 'TOOL_FAILED',
    correlation: { job: 'job-1' },
  };
  const { directory, sink, client } = await scriptedWorker(t, [
    'Traceback (most recent call last):',
    JSON.stringify(good),
    '{"at": broken',
    JSON.stringify({ ...good, level: 'shout' }),
    JSON.stringify({ ...good, event: 'worker.job-retried', level: 'warn' }),
  ]);
  await client.stop();
  sink.close();
  const written = await writtenRecords(directory);
  assert.deepEqual(
    written.map((record) => record.event),
    ['worker.job-failed', 'worker.job-retried', 'app.diagnostics-closed'],
  );
  assert.equal(written[0].correlation.job, 'job-1');
  // Raw stderr never reaches the file: the traceback line is not in it.
  assert.ok(!written.some((record) => JSON.stringify(record).includes('Traceback')));
});

test('a worker rejection leaves a record carrying the code it decided, correlated to its job', async (t) => {
  const { directory, sink, client } = await scriptedWorker(t, []);
  const ticket = client.request('media.probe', { path: '/absent.mp4' });
  // The scripted worker never answers; stopping it is what makes the request fail, so the stop
  // is started before the rejection is awaited rather than after it.
  const stopped = client.stop();
  await assert.rejects(ticket.result, /WORKER_EXITED/);
  await stopped;
  sink.close();
  const failure = (await writtenRecords(directory)).find(
    (record) => record.event === 'worker.request-failed',
  );
  assert.ok(failure, 'a coded worker rejection left no record');
  assert.equal(failure.code, 'WORKER_EXITED');
  assert.equal(failure.correlation.job, ticket.id);
  assert.equal(failure.detail.method, 'media.probe');
  assert.equal(failure.source.process, 'core');
});
