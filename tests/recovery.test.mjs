import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createProject } from '../dist-core/projects/project.js';
import { RecoveryStore } from '../dist-core/projects/recovery/recovery-store.js';

const project = () => createProject({ path: '/video/nguồn.mp4', sha256: 'a'.repeat(64) }, {
  cues: [{ id: 'cue1', start_ms: 0, end_ms: 1000, text: 'Cà phê ☕' }],
  sample: { start_ms: 0, end_ms: 1000 }, processing: { version: 1, editing: { speed: 2 } },
});
test('recovery persists complete current documents across reopen and rejects stale writes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'recovery-'));
  let store;
  try {
    const filename = path.join(dir, 'recovery.sqlite');
    store = new RecoveryStore(filename);
    assert.deepEqual(store.list(), []);
    const saved = store.save('document-001', 0, project());
    assert.equal(saved.revision, 1);
    assert.throws(() => store.save('document-001', 0, project()), /RECOVERY_CONFLICT/);
    assert.throws(() => store.load('document-001', 0), /RECOVERY_CONFLICT/);
    const next = project(); next.cues[0].text = 'Đã sửa';
    store.save('document-001', 1, next);
    assert.throws(() => store.discard('document-001', 1), /RECOVERY_CONFLICT/);
    store.close(); store = new RecoveryStore(filename);
    assert.equal(store.list()[0].cue_count, 1);
    assert.equal(store.load('document-001', 2).processing.editing.speed, 2);
    assert.equal(store.load('document-001', 2).cues[0].text, 'Đã sửa');
    const conflict = project(); conflict.source.sha256 = 'b'.repeat(64);
    assert.throws(() => store.save('document-001', 2, conflict), /RECOVERY_SOURCE_CONFLICT/);
    assert.throws(() => store.save('document-001', 2, { ...next, version: 999 }), /PROJECT_VERSION/);
    store.discard('document-001', 2); assert.deepEqual(store.list(), []);
  } finally { store?.close(); await rm(dir, { recursive: true, force: true }); }
});
test('discarding a draft never deletes source media and separate projects keep separate identities', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'recovery-safety-'));
  const store = new RecoveryStore(path.join(dir, 'recovery.sqlite'));
  try {
    const source = path.join(dir, 'original.mp4'); await writeFile(source, 'never delete');
    const input = project(); input.source.path = source;
    store.save('document-001', 0, input); store.save('document-002', 0, input);
    store.discard('document-001', 1);
    assert.equal(store.list().length, 1);
    assert.equal(await readFile(source, 'utf8'), 'never delete');
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});
test('unsupported recovery stores fail without reset or automatic migration', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'recovery-version-'));
  try {
    const filename = path.join(dir, 'recovery.sqlite');
    const database = new DatabaseSync(filename); database.exec('CREATE TABLE keep_me(data TEXT); PRAGMA user_version=42;'); database.close();
    const before = await readFile(filename);
    assert.throws(() => new RecoveryStore(filename), /RECOVERY_VERSION/);
    assert.deepEqual(await readFile(filename), before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
