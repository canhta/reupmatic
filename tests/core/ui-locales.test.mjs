import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ui = path.join(root, 'app/ui');

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(filename) : [filename];
  });
}

function messageKeys(files) {
  const owners = new Map();
  for (const file of files.filter((filename) => !filename.endsWith('/index.ts'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/^[ ]{2}([A-Za-z_$][\w$]*):/gm)) {
      const previous = owners.get(match[1]);
      assert.equal(previous, undefined, `${match[1]} is duplicated in ${previous} and ${file}`);
      owners.set(match[1], file);
    }
  }
  return [...owners.keys()].sort();
}

test('the distribution locale catalogues carry identical keys in English and Vietnamese', () => {
  const distribution = (locale) => [path.join(ui, 'locales', locale, 'distribution.ts')];
  assert.deepEqual(messageKeys(distribution('en')), messageKeys(distribution('vi')));
});

test('the recognized cue count uses i18next plural keys in both locales', () => {
  for (const locale of ['en', 'vi']) {
    const source = readFileSync(path.join(ui, 'locales', locale, 'speech.ts'), 'utf8');
    assert.match(source, /^ {2}speechReplaceHelp_one:/m, `${locale} needs the singular key`);
    assert.match(source, /^ {2}speechReplaceHelp_other:/m, `${locale} needs the plural key`);
    assert.doesNotMatch(source, /^ {2}speechReplaceHelp:/m, `${locale} kept the "(s)" key`);
  }
});

test('UI messages are separated by locale and composed outside the i18n initializer', () => {
  const english = filesBelow(path.join(ui, 'locales/en')).filter((file) => file.endsWith('.ts'));
  const vietnamese = filesBelow(path.join(ui, 'locales/vi')).filter((file) => file.endsWith('.ts'));
  assert.deepEqual(
    english.map((file) => path.relative(path.join(ui, 'locales/en'), file)).sort(),
    vietnamese.map((file) => path.relative(path.join(ui, 'locales/vi'), file)).sort(),
  );
  assert.ok(english.length > 5, 'locale catalogs should be split by capability');
  assert.deepEqual(messageKeys(english), messageKeys(vietnamese));

  const initializer = readFileSync(path.join(ui, 'i18n.ts'), 'utf8');
  assert.doesNotMatch(initializer, /export const (en|vi)\s*=/);
  assert.ok(initializer.split('\n').length < 40, 'i18n.ts should only initialize localization');

  const mixedCatalogs = filesBelow(path.join(ui, 'features')).filter((file) =>
    file.endsWith('/i18n.ts'),
  );
  assert.deepEqual(mixedCatalogs, []);
});
