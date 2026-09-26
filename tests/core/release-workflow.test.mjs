import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/release.yml', import.meta.url),
  'utf8',
);

// A new version has no GitHub release yet; uploading before `gh release create` fails the job.
test('every release job creates the release before uploading runtime packs', () => {
  for (const job of ['mac', 'win']) {
    const body = workflow.split(`\n  ${job}:`)[1]?.split(/\n {2}[a-z]+:/)[0];
    assert.ok(body, `${job}: job not found in release.yml`);
    const ensure = body.indexOf('name: Ensure the release exists');
    const upload = body.indexOf('name: Upload runtime packs to the release');
    const publish = body.indexOf('name: Package, sign');
    assert.ok(ensure >= 0, `${job}: missing "Ensure the release exists" step`);
    assert.ok(upload >= 0, `${job}: missing runtime pack upload step`);
    assert.ok(publish >= 0, `${job}: missing electron-builder publish step`);
    assert.ok(ensure < upload, `${job}: must create the release before uploading packs`);
    assert.ok(upload < publish, `${job}: must upload packs before electron-builder publishes`);
  }
});
