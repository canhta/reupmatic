import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { bundledFonts, fontFamilies } from '../../dist-core/subtitles/fonts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function pythonBundledFonts() {
  const source = readFileSync(path.join(root, 'worker', 'subtitles', 'fonts.py'), 'utf8');
  const block = source.match(/BUNDLED_FONTS[^{]*\{([^}]*)\}/s);
  assert.ok(block, 'could not find BUNDLED_FONTS in worker/subtitles/fonts.py');
  return [...block[1].matchAll(/"([^"]+)":\s*\(([^)]*)\)/g)].map((match) => ({
    family: match[1],
    files: [...match[2].matchAll(/"([^"]+)"/g)].map((file) => file[1]),
  }));
}

test('the Python bundled font list equals core fontFamilies and every file ships', () => {
  const python = pythonBundledFonts();
  assert.deepEqual(
    python.map((font) => font.family),
    [...fontFamilies],
    'worker/subtitles/fonts.py families must equal app/core/subtitles/fonts.ts',
  );
  assert.deepEqual(
    python.map((font) => font.files),
    bundledFonts.map((font) => [font.regular.file, font.bold.file]),
    'worker/subtitles/fonts.py files must equal app/core/subtitles/fonts.ts',
  );
  for (const font of bundledFonts) {
    for (const file of [font.regular.file, font.bold.file]) {
      assert.ok(existsSync(path.join(root, 'fonts', file)), `fonts/${file} must exist`);
    }
  }
});
