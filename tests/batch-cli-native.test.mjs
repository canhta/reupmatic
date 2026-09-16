import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BatchStore } from '../dist-core/batch/batch-store.js';
import { hashFile } from '../dist-core/media/files.js';

const root = fileURLToPath(new URL('../', import.meta.url));
test('developer CLI shares the durable queue and refuses workspace reuse', async (t) => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-batch-cli-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const video = path.join(directory, 'Nguồn.mp4');
  const broken = path.join(directory, 'broken.mp4');
  const media = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=160x90:rate=12:duration=1',
    '-c:v',
    'libx264',
    '-threads',
    '1',
    '-n',
    video,
  ]);
  assert.equal(media.status, 0, media.stderr.toString());
  await writeFile(broken, 'invalid media bytes');
  const before = await hashFile(video);
  const manifest = path.join(directory, 'inputs.json');
  await writeFile(manifest, JSON.stringify([{ video: broken }, { video }]));
  const workspace = path.join(directory, 'workspace');
  const args = ['scripts/batch.mjs', manifest, workspace];
  const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 1, run.stderr);
  const results = run.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    results.map((job) => job.status),
    ['failed', 'complete'],
  );
  const store = new BatchStore(path.join(workspace, 'batch.sqlite'));
  const jobs = store.list();
  store.close();
  assert.equal(jobs.length, 2);
  assert.equal(jobs[1].id, results[1].id);
  assert.equal(await hashFile(jobs[1].output.path), jobs[1].output.sha256);
  assert.equal(await hashFile(video), before);
  const journal = await readFile(path.join(workspace, 'batch.sqlite'));
  const repeat = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.equal(repeat.status, 1);
  assert.match(repeat.stderr, /EEXIST/);
  assert.deepEqual(await readFile(path.join(workspace, 'batch.sqlite')), journal);
});
