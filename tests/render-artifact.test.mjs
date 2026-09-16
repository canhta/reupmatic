import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { renderArtifactPath } from '../dist-core/media/render-artifact.js';

const workspace = path.resolve('test-workspace');
const digest = 'a'.repeat(64);
const uuid = '4ec7abe0-60ba-4e82-a938-df9078e5d9f4';
test('host accepts the actual nested render cache and flat vision output contracts', () => {
  for (const filename of ['output.mp4', 'output.mkv']) {
    const actual = path.join(workspace, 'renders', digest, filename);
    assert.equal(renderArtifactPath(workspace, digest, actual), actual);
  }
  const sample = path.join(workspace, 'renders', `${uuid}.mp4`);
  assert.equal(renderArtifactPath(workspace, uuid, sample), sample);
});
test('artifact mapping rejects traversal, wrong IDs, arbitrary files and sibling roots', () => {
  for (const [id, filename] of [
    [digest, path.join(workspace, 'renders', 'other', 'output.mp4')],
    [digest, path.join(workspace, 'renders-elsewhere', digest, 'output.mp4')],
    [digest, path.join(workspace, 'renders', digest, 'secret.txt')],
    ['../escape', path.join(workspace, 'renders', 'escape.mp4')],
    [uuid, path.join(workspace, 'renders', digest, 'output.mp4')],
    [digest, 'output.mp4'],
    [digest, `${path.join(workspace, 'renders', digest, 'output.mp4')}\0`],
  ]) {
    assert.throws(() => renderArtifactPath(workspace, id, filename), /INVALID_WORKER_RESPONSE/);
  }
});
