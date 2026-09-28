// GPLv3 static FFmpeg 9.0.2 with libass >= 0.17.5 (\fad reaches BorderStyle 4 boxes).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDS } from './ffmpeg-builds.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'ffmpeg');
const platform = `${process.platform}-${process.arch}`;
const archives = BUILDS[platform];
if (!archives) {
  throw new Error(`No pinned FFmpeg build for ${platform}; supported: ${Object.keys(BUILDS)}`);
}
// Git Bash puts GNU tar first on PATH, which cannot read zip; Windows' own bsdtar can.
const tar =
  process.platform === 'win32'
    ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';

const scratch = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-ffmpeg-'));
try {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const archive of archives) {
    const response = await fetch(archive.url);
    if (!response.ok) {
      throw new Error(`${archive.url}: HTTP ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== archive.sha256) {
      throw new Error(`${archive.url}: SHA-256 ${digest}, expected ${archive.sha256}`);
    }
    const zip = path.join(scratch, path.basename(new URL(archive.url).pathname));
    const unpacked = path.join(scratch, path.basename(zip, '.zip'));
    await writeFile(zip, bytes);
    await mkdir(unpacked, { recursive: true });
    const members = Object.values(archive.files);
    const result = spawnSync(tar, ['-xf', zip, '-C', unpacked, ...members], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`could not extract ${zip}: ${result.stderr || result.error?.message}`);
    }
    for (const [name, member] of Object.entries(archive.files)) {
      const destination = path.join(target, name);
      await copyFile(path.join(unpacked, member), destination);
      if (process.platform !== 'win32') {
        await chmod(destination, 0o755);
      }
    }
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}

const executable = (name) => path.join(target, process.platform === 'win32' ? `${name}.exe` : name);
const lines = [];
for (const name of ['ffmpeg', 'ffprobe']) {
  const result = spawnSync(executable(name), ['-version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${name} did not run: ${result.stderr || result.error?.message}`);
  }
  lines.push(result.stdout.split('\n')[0]);
  console.log(lines.at(-1));
}
await writeFile(path.join(target, 'VERSION.txt'), `${lines.join('\n')}\n`, 'utf8');
console.log('ffmpeg/ staged');
