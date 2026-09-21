// Stage ffmpeg/ffprobe under `ffmpeg/` for the current OS/arch. ffmpeg comes from the pinned
// `ffmpeg-static` build; ffprobe from `@ffprobe-installer/ffprobe`, because `ffprobe-static`'s
// "darwin-arm64" binary is actually x86_64. The build is GPL because the app encodes with libx264
// (worker/media/encoding.py, worker/vision/service.py); see THIRD-PARTY-NOTICES.md for the
// licence and the source offer. electron-builder copies `ffmpeg/` into the packaged app's
// resources (electron-builder.yml) and app/electron/main.ts resolves it when packaged.
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import ffmpegStatic from 'ffmpeg-static';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'ffmpeg');
const executable = (name) => (process.platform === 'win32' ? `${name}.exe` : name);

if (!ffmpegStatic || !ffprobeStatic?.path) {
  throw new Error('ffmpeg/ffprobe did not resolve a binary for this platform');
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

const ffmpeg = path.join(target, executable('ffmpeg'));
const ffprobe = path.join(target, executable('ffprobe'));
await copyFile(ffmpegStatic, ffmpeg);
await copyFile(ffprobeStatic.path, ffprobe);
if (process.platform !== 'win32') {
  await chmod(ffmpeg, 0o755);
  await chmod(ffprobe, 0o755);
}

for (const [name, binary] of [
  ['ffmpeg', ffmpeg],
  ['ffprobe', ffprobe],
]) {
  const result = spawnSync(binary, ['-version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${name} did not run: ${result.stderr || result.error?.message}`);
  }
  console.log(result.stdout.split('\n')[0]);
}

const version = spawnSync(ffmpeg, ['-version'], { encoding: 'utf8' }).stdout.split('\n')[0];
await writeFile(path.join(target, 'VERSION.txt'), `${version}\n`, 'utf8');
console.log('ffmpeg/ staged');
