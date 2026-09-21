import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRecentEntries, withRecentEntry } from '../../dist-core/projects/recent.js';

const video = { kind: 'video', id: 'a1', name: 'clip.mp4', path: '/videos/clip.mp4', opened_at: 1 };
const project = {
  kind: 'project',
  id: 'p1',
  name: 'My Project',
  path: '/projects/p1.json',
  source_path: '/videos/clip.mp4',
  opened_at: 2,
};

test('parseRecentEntries tolerates a corrupt or foreign file instead of throwing', () => {
  assert.deepEqual(parseRecentEntries(undefined), []);
  assert.deepEqual(parseRecentEntries(null), []);
  assert.deepEqual(parseRecentEntries('not an array'), []);
  assert.deepEqual(parseRecentEntries([{ garbage: true }]), []);
  assert.deepEqual(parseRecentEntries([video, { ...project, kind: 'bogus' }]), [video]);
  assert.deepEqual(parseRecentEntries([video, project]), [video, project]);
});

test('parseRecentEntries caps at the maximum and rejects unknown extra fields', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ ...video, id: `v${i}` }));
  assert.equal(parseRecentEntries(many).length, 8);
  assert.deepEqual(parseRecentEntries([{ ...video, extra: 'nope' }]), []);
});

test('withRecentEntry moves an entry to the front, de-duplicated by kind+id', () => {
  const list = withRecentEntry([video, project], { ...video, opened_at: 99 });
  assert.equal(list.length, 2);
  assert.equal(list[0].opened_at, 99);
  assert.equal(list[1].id, 'p1');
});

test('withRecentEntry caps the list at eight entries, dropping the oldest', () => {
  let list = [];
  for (let i = 0; i < 10; i += 1) {
    list = withRecentEntry(list, { ...video, id: `v${i}`, opened_at: i });
  }
  assert.equal(list.length, 8);
  assert.equal(list[0].id, 'v9');
  assert.ok(!list.some((item) => item.id === 'v0' || item.id === 'v1'));
});
