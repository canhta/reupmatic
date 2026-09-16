import { protectSources } from '../dist-core/media/files.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { link, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createProject, loadProject, parseProject, saveProject } from '../dist-core/projects/project.js';
import { assertCues } from '../dist-core/subtitles/cues.js';
const source = { path: '/videos/tự quay.mp4', sha256: 'a'.repeat(64) };
const state = () => ({
  cues: [{ id: 'cue-1', start_ms: 120, end_ms: 1500, text: 'Cà phê Việt Nam\nEnglish ☕' }],
  sample: { start_ms: 0, end_ms: 2000 },
});

test('project round-trip retains Unicode cues and sample interval without media copies', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-project-'));
  try {
    const file = path.join(dir, 'Bản dựng.reupmatic.json');
    const project = createProject(source, state());
    await saveProject(file, project);
    assert.deepEqual(await loadProject(file), project);
    assert.deepEqual(await readdir(dir), ['Bản dựng.reupmatic.json']);
    assert.ok((await stat(file)).size < 2048);
    assert.equal('uiLocale' in project, false); assert.equal('worker' in project, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('project snapshots are independent from subsequent editor changes', () => {
  const edits = state(); const project = createProject(source, edits);
  edits.cues[0].text = 'changed'; edits.sample.end_ms = 5000;
  assert.equal(project.cues[0].text, 'Cà phê Việt Nam\nEnglish ☕');
  assert.equal(project.sample.end_ms, 2000);
});

test('unknown version, external instructions, URL sources and malformed cue data are rejected', () => {
  const good = createProject(source, state());
  assert.throws(() => parseProject({ ...good, version: 6 }), /PROJECT_VERSION/);
  for (const invalid of [null, [], { ...good, token: 'secret' },
    { ...good, source: { ...source, path: 'https://example.org/video.mp4' } },
    { ...good, source: { ...source, sha256: '' } }, { ...good, cues: [null] },
    { ...good, cues: [{ ...good.cues[0], script: 'publish' }] },
    { ...good, sample: { start_ms: 2000, end_ms: 1000 } },
    { ...good, cues: [good.cues[0], good.cues[0]] }]) {
    assert.throws(() => parseProject(invalid));
  }
});

test('malformed, oversized and invalid UTF-8 input never becomes a partial project', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-corrupt-'));
  try {
    const file = path.join(dir, 'bad.reupmatic.json');
    for (const data of ['{"format":', Buffer.from([0xff, 0xfe]), Buffer.alloc(2 * 1024 * 1024 + 1)]) {
      await writeFile(file, data); await assert.rejects(loadProject(file));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('saving invalid edits preserves the existing valid project', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-atomic-'));
  try {
    const file = path.join(dir, 'edit.reupmatic.json'); const project = createProject(source, state());
    await saveProject(file, project); const before = await readFile(file);
    await assert.rejects(saveProject(file, { ...project, cues: [{ ...project.cues[0], end_ms: 0 }] }));
    assert.deepEqual(await readFile(file), before);
    const changed = createProject(source, { ...state(), cues: [{ ...state().cues[0], text: 'Đã sửa' }] });
    await saveProject(file, changed); assert.deepEqual(await loadProject(file), changed);
    assert.deepEqual(await readdir(dir), ['edit.reupmatic.json']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('source overwrite checks include same path and hardlink aliases', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-protect-'));
  try {
    const original = path.join(dir, 'original.mp4'); const alias = path.join(dir, 'alias.reupmatic.json');
    await writeFile(original, 'original media bytes'); await link(original, alias);
    const digest = createHash('sha256').update(await readFile(original)).digest('hex');
    const project = createProject({ path: original, sha256: digest }, state());
    await assert.rejects(protectSources(original, [original]), /SOURCE_OVERWRITE/);
    await assert.rejects(saveProject(alias, project), /SOURCE_OVERWRITE/);
    await assert.rejects(saveProject(original, project), /PROJECT_EXTENSION/);
    assert.equal(await readFile(original, 'utf8'), 'original media bytes');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('runtime cue boundary rejects non-arrays and extra fields without raw TypeErrors', () => {
  for (const value of [undefined, null, {}, [null], [3], [{ ...state().cues[0], extra: true }]]) {
    assert.throws(() => assertCues(value), /INVALID_CUES/);
  }
});
