import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WorkerClient } from '../../dist-core/worker/worker-client.js';

const HELLO_RESULT =
  '{"v": 1, "id": req["id"], "revision": req["revision"], "event": "result", ' +
  '"data": {"protocol": 1, "ffmpeg": True, "pysubs2": True, "ocr": False, ' +
  '"inpainting": False, "durable_jobs": False}}';

const LAUNCH_LOG = [
  'import json, os, sys',
  'ws = sys.argv[sys.argv.index("--workspace") + 1]',
  'with open(os.path.join(ws, "launches.log"), "a") as log:',
  '    log.write("launch\\n")',
];

function scriptedWorker(mode) {
  if (mode === 'answer-then-exit') {
    return [
      ...LAUNCH_LOG,
      'line = sys.stdin.readline()',
      'req = json.loads(line)',
      `print(json.dumps(${HELLO_RESULT}), flush=True)`,
      '',
    ].join('\n');
  }
  // `exit-without-answering`: dies on startup, before any reply reaches the client.
  return [...LAUNCH_LOG, 'sys.exit(1)', ''].join('\n');
}

async function harness(t, mode) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-restart-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const script = path.join(workspace, 'scripted-worker.py');
  await writeFile(script, scriptedWorker(mode));
  const records = [];
  const client = new WorkerClient(process.env.PYTHON || 'python3', script, workspace, {
    record: (entry) => records.push(entry),
  });
  return { client, workspace, records };
}

async function launches(workspace) {
  const written = await readFile(path.join(workspace, 'launches.log'), 'utf8').catch(() => '');
  return written.split('\n').filter(Boolean).length;
}

test('a worker that answered and then died is replaced on the next request', async (t) => {
  const { client, workspace, records } = await harness(t, 'answer-then-exit');

  const first = await client.request('hello', {}).result;
  assert.equal(first.protocol, 1, 'the first child answered');
  await once(client, 'exit');

  const secondExit = once(client, 'exit');
  const second = await client.request('hello', {}).result;
  assert.equal(second.protocol, 1, 'the replacement child answered');
  await secondExit;

  assert.equal(await launches(workspace), 2, 'exactly one replacement was started');
  assert.ok(
    records.some((record) => record.event === 'worker.restarted'),
    'the restart is recorded for diagnostics',
  );
  await client.stop();
});

test('a worker that never answered is not respawned, so polls cannot spawn-storm', async (t) => {
  const { client, workspace, records } = await harness(t, 'exit-without-answering');

  const exit = once(client, 'exit');
  await assert.rejects(client.request('hello', {}).result, /WORKER_EXITED/);
  await exit;

  await assert.rejects(client.request('hello', {}).result, /WORKER_EXITED/);
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(await launches(workspace), 1, 'the broken child was never replaced');
  assert.ok(!records.some((record) => record.event === 'worker.restarted'));
  await client.stop();
});
