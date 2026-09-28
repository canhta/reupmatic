#!/usr/bin/env node
// TypeScript 7's `tsc` bin is an ESM launcher that resolves the native compiler through a
// package-imports specifier; on Windows that becomes a bare `D:\...` path Node's ESM loader
// rejects. Resolve the platform package with CJS and spawn its binary directly.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}`;
const typescriptDirectory = path.dirname(require.resolve('typescript/package.json'));
const platformDirectory = path.dirname(
  require.resolve(`${platformPackage}/package.json`, { paths: [typescriptDirectory] }),
);
const executable = path.join(
  platformDirectory,
  'lib',
  process.platform === 'win32' ? 'tsc.exe' : 'tsc',
);

const result = spawnSync(executable, process.argv.slice(2), { stdio: 'inherit' });
if (result.error) {
  console.error(`tsc could not start: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
