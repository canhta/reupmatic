import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BUILDS } from '../../scripts/ffmpeg-builds.mjs';
import { GPL_SOURCES } from '../../scripts/gpl-sources.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const notices = read('THIRD-PARTY-NOTICES.md');
const workflow = read('.github/workflows/release.yml');
const files = GPL_SOURCES.map((source) => source.file);

test('the corresponding source covers both FFmpeg builds and the PyAV wheel', () => {
  assert.deepEqual(files, [
    'ffmpeg-9.0.2.tar.xz',
    'martin-riedl-ffmpeg-build-script-6a611e19870e.tar.gz',
    'gyan-ffmpeg-9.0.2-essentials_build-README.txt',
    'av-18.1.0.tar.gz',
    'pyav-ffmpeg-8.1.2-1.tar.gz',
    'ffmpeg-8.1.2.tar.xz',
  ]);
  for (const source of GPL_SOURCES) {
    if (source.git) assert.match(source.git.commit, /^[0-9a-f]{40}$/);
    else assert.match(source.sha256, /^[0-9a-f]{64}$/);
  }
});

test('the Windows README comes from the exact archive stage:ffmpeg ships', () => {
  const readme = GPL_SOURCES.find((source) => source.member);
  const [shipped] = BUILDS['win32-x64'];
  assert.equal(readme.url, shipped.url);
  assert.equal(readme.archiveSha256, shipped.sha256);
});

test('the worker pins av at the version the notices describe', () => {
  const pinned = read('worker/requirements-speech.txt').match(/^av==(\S+)$/m)?.[1];
  assert.equal(pinned, '18.1.0');
  assert.match(notices, new RegExp(`PyAV ${pinned.replaceAll('.', '\\.')}`));
  assert.ok(files.includes(`av-${pinned}.tar.gz`));
});

test('the notices point at the release attachments, not an owner to-do', () => {
  assert.doesNotMatch(notices, /Owner action/);
  assert.match(notices, /https:\/\/github\.com\/canhta\/reupmatic\/releases/);
  for (const file of files) assert.ok(notices.includes(file), `notices do not name ${file}`);
});

test('the release workflow attaches the corresponding source to the release', () => {
  const job = workflow.split('\n  source:')[1]?.split(/\n {2}[a-z]+:/)[0];
  assert.ok(job, 'release.yml has no source job');
  const ensure = job.indexOf('name: Ensure the release exists');
  const stage = job.indexOf('node scripts/stage-gpl-source.mjs');
  const upload = job.indexOf('release/corresponding-source/*');
  assert.ok(ensure >= 0 && stage >= 0 && upload >= 0, 'source job is incomplete');
  assert.ok(ensure < upload && stage < upload);
});
