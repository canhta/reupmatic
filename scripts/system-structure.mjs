import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function location(root, relative) {
  if (typeof relative !== 'string' || !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(relative)
    || relative.split('/').some(part => part === '.' || part === '..')) throw new Error(`Unsafe path: ${relative}`);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw new Error(`Symlink: ${relative}`);
  }
  return current;
}

export function readSystemMap(root = projectRoot) {
  const map = JSON.parse(readFileSync(path.join(root, 'docs/architecture/system-map.json'), 'utf8'));
  if (map.format !== 'reupmatic.system-map' || map.version !== 1 || !Array.isArray(map.modules)) {
    throw new Error('Unsupported system map');
  }
  const ids = new Set();
  const paths = new Set();
  for (const module of map.modules) {
    if (!module.id || ids.has(module.id) || !['partial', 'planned'].includes(module.status)) throw new Error('Invalid module');
    ids.add(module.id);
    for (const name of [...module.implemented, ...module.reserved]) {
      location(root, name);
      if (paths.has(name)) throw new Error(`Duplicate ownership: ${name}`);
      paths.add(name);
    }
  }
  if (map.scope_authority !== 'BUSINESS_SCOPE.md' || map.modules.length === 0) throw new Error('Missing scope authority');
  for (const module of map.modules) {
    if (!Array.isArray(module.scope) || !module.scope.length || !module.remaining?.trim()) throw new Error(`Missing scope: ${module.id}`);
    if (module.status === 'planned' && module.implemented.length) throw new Error(`Planned implementation: ${module.id}`);
    if (module.status === 'partial' && !module.implemented.length) throw new Error(`Empty implementation: ${module.id}`);
    for (const name of [...module.implemented, ...module.reserved]) {
      if (name.includes('/routing') && module.id !== 'automation') throw new Error('Automation owns routing');
    }
  }
  return map;
}

function containsSource(directory) {
  return readdirSync(directory, { withFileTypes: true }).some(entry => {
    if (entry.isSymbolicLink()) throw new Error(`Symlink in source: ${directory}/${entry.name}`);
    return entry.isDirectory() ? containsSource(path.join(directory, entry.name))
      : /\.(?:ts|tsx|cts|py)$/.test(entry.name);
  });
}

export function scaffold(root = projectRoot) {
  const created = [];
  for (const module of readSystemMap(root).modules) {
    for (const name of module.reserved) {
      const directory = location(root, name);
      mkdirSync(directory, { recursive: true });
      const marker = location(root, `${name}/.gitkeep`);
      if (!existsSync(marker)) {
        writeFileSync(marker, '', { flag: 'wx' });
        created.push(`${name}/.gitkeep`);
      } else if (!lstatSync(marker).isFile() || lstatSync(marker).isSymbolicLink()) {
        throw new Error(`Invalid marker: ${name}`);
      }
    }
  }
  return created;
}

export function checkStructure(root = projectRoot) {
  const map = readSystemMap(root);
  const failures = [];
  const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (map.source_version !== version) failures.push('System map version differs from package.json');
  const coverage = new Set(map.modules.flatMap(module => module.scope));
  for (let n = 1; n <= 14; n++) if (!coverage.has(`SC-${String(n).padStart(2, '0')}`)) failures.push(`Unmapped SC-${n}`);
  for (const module of map.modules) {
    for (const name of module.implemented) {
      const directory = location(root, name);
      if (!existsSync(directory) || !lstatSync(directory).isDirectory()
        || !containsSource(directory)) failures.push(`Missing implementation: ${name}`);
    }
    for (const name of module.reserved) {
      const marker = location(root, `${name}/.gitkeep`);
      if (!existsSync(marker) || !lstatSync(marker).isFile()) failures.push(`Missing reserved boundary: ${name}`);
    }
  }
  const retained = JSON.parse(readFileSync(path.join(root, 'docs/architecture/retained-paths.json'), 'utf8'));
  for (const name of retained.paths) {
    const actual = retained.moves[name] ?? name;
    if (!lstatSync(location(root, actual), { throwIfNoEntry: false })?.isFile()) failures.push(`Delivered source removed without a mapped move: ${name}`);
  }
  if (failures.length) throw new Error(failures.join('\n'));
  return { modules: map.modules.length, reserved: map.modules.flatMap(module => module.reserved).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--create')) throw new Error('Usage: system-structure.mjs [--create]');
    if (process.argv.includes('--create')) console.log(`Created ${scaffold().length} markers; existing files untouched.`);
    else console.log(checkStructure());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
