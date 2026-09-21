import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version ?? '')) {
  console.error('usage: node scripts/set-version.mjs <semver>');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'package.json');
const manifest = JSON.parse(await readFile(file, 'utf8'));
manifest.version = version;
await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`package.json version = ${version}`);
