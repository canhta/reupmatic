import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Source ZIPs are not Git checkouts. Never install into an unrelated parent repo.
export function shouldInstallHooks(root, env = process.env) {
  if (env.CI || env.LEFTHOOK === '0') return false;
  if (!existsSync(path.join(root, '.git'))) return false;
  const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  return git.status === 0 && realpathSync(git.stdout.trim()) === realpathSync(root);
}

export function installHooks(root, env = process.env) {
  if (!shouldInstallHooks(root, env)) {
    console.log(
      'Reupmatic: hook setup skipped (CI or not a repository root). Run npm run hooks:install after git init.',
    );
    return 0;
  }
  const binary = path.join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'lefthook.cmd' : 'lefthook',
  );
  if (!existsSync(binary))
    throw new Error('Lefthook is missing. Install development dependencies first.');
  const result = spawnSync(binary, ['install'], {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = installHooks(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
}
