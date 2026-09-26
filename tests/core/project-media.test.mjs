import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProjectMedia } from '../../dist-core/editing/project-media.js';
import { createProject, parseProject } from '../../dist-core/projects/project.js';

const source = { path: '/videos/source.mp4', sha256: 'a'.repeat(64) };
const video = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'video',
  path: '/videos/thêm.mp4',
  name: 'thêm.mp4',
  sha256: 'b'.repeat(64),
  duration_ms: 4200,
};
const subtitle = {
  id: '22222222-2222-4222-8222-222222222222',
  kind: 'subtitle',
  path: '/subs/phụ đề.srt',
  name: 'phụ đề.srt',
  sha256: 'c'.repeat(64),
};

test('Project media round-trips through the project contract', () => {
  const project = createProject(source, {
    cues: [],
    media: [video, { ...subtitle, imported_layer: 'displayed' }],
  });
  assert.deepEqual(parseProject(project).media, [
    video,
    { ...subtitle, imported_layer: 'displayed' },
  ]);
});

test('a project with no added media is still valid (the rows are derived)', () => {
  const project = createProject(source, { cues: [] });
  assert.equal('media' in project, false);
});

test('malformed Project media is refused without a default-filling reader', () => {
  for (const bad of [
    'not-an-array',
    [{}],
    [{ ...video, kind: 'audio' }],
    [{ ...video, sha256: 'nope' }],
    [{ ...video, id: 'short' }],
    [{ ...video, duration_ms: 0 }],
    [video, video],
    [{ ...subtitle, imported_layer: 'nope' }],
    [{ ...subtitle, duration_ms: 100 }],
    [{ ...video, imported_layer: 'displayed' }],
    [{ ...video, script: 'run' }],
  ]) {
    assert.throws(() => parseProjectMedia(bad), /INVALID_PROJECT/);
  }
});

test('a project rejects a media path that is a remote URL', () => {
  assert.throws(
    () =>
      createProject(source, {
        cues: [],
        media: [{ ...video, path: 'https://example.org/video.mp4' }],
      }),
    /INVALID_PROJECT/,
  );
});
