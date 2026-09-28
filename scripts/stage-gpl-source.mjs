// Collect GPL_SOURCES under release/corresponding-source/, each checked by SHA-256 or git commit.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GPL_SOURCES } from './gpl-sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'release', 'corresponding-source');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')}: ${result.stderr || result.error?.message}`);
  }
  return result.stdout;
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function download(url, expected) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = sha256(bytes);
  if (digest !== expected) throw new Error(`${url}: SHA-256 ${digest}, expected ${expected}`);
  return bytes;
}

const scratch = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-gpl-source-'));
try {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  const index = [];
  for (const source of GPL_SOURCES) {
    const destination = path.join(target, source.file);
    if (source.git) {
      // The commit id pins the content; fetch exactly it and archive its tree.
      const clone = path.join(scratch, path.basename(source.file, '.tar.gz'));
      await mkdir(clone);
      run('git', ['init', '--quiet'], clone);
      run(
        'git',
        ['fetch', '--quiet', '--depth', '1', source.git.repository, source.git.commit],
        clone,
      );
      const fetched = run('git', ['rev-parse', 'FETCH_HEAD'], clone).trim();
      if (fetched !== source.git.commit) {
        throw new Error(
          `${source.git.repository}: fetched ${fetched}, expected ${source.git.commit}`,
        );
      }
      const prefix = `${path.basename(source.file, '.tar.gz')}/`;
      run(
        'git',
        ['archive', '--format=tar.gz', `--prefix=${prefix}`, '-o', destination, fetched],
        clone,
      );
      index.push(
        `${source.file}\n  ${source.what}\n  ${source.git.repository} @ ${source.git.commit}`,
      );
    } else if (source.member) {
      const zip = path.join(scratch, path.basename(new URL(source.url).pathname));
      await writeFile(zip, await download(source.url, source.archiveSha256));
      const unpacked = path.join(scratch, 'member');
      await mkdir(unpacked, { recursive: true });
      // Windows' own bsdtar reads zip (Git Bash's GNU tar cannot); elsewhere use unzip.
      if (process.platform === 'win32') {
        const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
        run(tar, ['-xf', zip, '-C', unpacked, source.member], root);
      } else {
        run('unzip', ['-q', zip, source.member, '-d', unpacked], root);
      }
      const bytes = await readFile(path.join(unpacked, source.member));
      if (sha256(bytes) !== source.sha256) throw new Error(`${source.member}: SHA-256 mismatch`);
      await writeFile(destination, bytes);
      index.push(`${source.file}\n  ${source.what}\n  ${source.member} from ${source.url}`);
    } else {
      await writeFile(destination, await download(source.url, source.sha256));
      index.push(`${source.file}\n  ${source.what}\n  ${source.url}`);
    }
    console.log(`collected ${source.file}`);
  }
  await writeFile(
    path.join(target, 'CORRESPONDING-SOURCE.txt'),
    `Corresponding source for the GPL/LGPL components Reupmatic bundles; see THIRD-PARTY-NOTICES.md.\n\n${index.join('\n\n')}\n`,
    'utf8',
  );
  console.log(`release/corresponding-source/ staged (${GPL_SOURCES.length} files)`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
