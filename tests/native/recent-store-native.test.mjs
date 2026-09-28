import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RecentStore } from '../../dist-node/electron/features/projects/recent-store.js';

function entry(id, openedAt) {
  return {
    kind: id.endsWith('.mp4') ? 'video' : 'project',
    id,
    name: path.basename(id),
    path: id,
    opened_at: openedAt,
  };
}

test('the recent store records, removes, and never loses a concurrent write', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'recent-store-'));
  try {
    const file = path.join(dir, 'recent.json');
    const store = new RecentStore(file);
    await store.record(entry('/a.reupmatic.json', 1));
    await store.record(entry('/b.reupmatic.json', 2));
    assert.deepEqual(
      (await store.list()).map((item) => item.id),
      ['/b.reupmatic.json', '/a.reupmatic.json'],
    );

    await store.remove('/b.reupmatic.json');
    assert.deepEqual(
      (await store.list()).map((item) => item.id),
      ['/a.reupmatic.json'],
    );

    await Promise.all([store.record(entry('/c.mp4', 3)), store.record(entry('/d.mp4', 4))]);
    const ids = (await store.list()).map((item) => item.id);
    assert.ok(ids.includes('/c.mp4') && ids.includes('/d.mp4'), 'both writes survive');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a corrupt recent file reads empty and the next write replaces it cleanly', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'recent-corrupt-'));
  try {
    const file = path.join(dir, 'recent.json');
    await writeFile(file, '{ not json');
    const store = new RecentStore(file);
    assert.deepEqual(await store.list(), []);
    await store.record(entry('/a.reupmatic.json', 1));
    assert.equal(JSON.parse(await readFile(file, 'utf8')).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
