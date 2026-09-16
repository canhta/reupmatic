// Explicit source-only development mode; never a production Plus bypass.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import electron from 'electron';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(electron, ['.'], { cwd: root, stdio: 'inherit', env: { ...process.env, REUPMATIC_DEV_AUTOMATION: '1' } });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
