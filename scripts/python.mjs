import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function pythonExecutable(root, env = process.env, platform = process.platform) {
  if (env.PYTHON) return env.PYTHON;
  const local = path.join(
    root,
    '.venv',
    ...(platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']),
  );
  if (existsSync(local)) return local;
  return platform === 'win32' ? 'python' : 'python3';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = spawnSync(pythonExecutable(root), process.argv.slice(2), {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    console.error(`Reupmatic Python command failed: ${result.error.message}`);
    process.exitCode = 1;
  } else process.exitCode = result.status ?? 1;
}
