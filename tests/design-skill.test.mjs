import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('local skill is linked from AGENTS and keeps reference distinct from desktop adaptation', () => {
  const skill = read('.agents/skills/reupmatic-ui-design/SKILL.md');
  assert.match(skill, /^---\nname: reupmatic-ui-design\ndescription:/);
  assert.match(read('AGENTS.md'), /\.agents\/skills\/reupmatic-ui-design\/SKILL\.md/);
  assert.match(skill, /Double-Bezel/); assert.match(skill, /prefers-reduced-motion/);
  assert.match(read('.agents/skills/reupmatic-ui-design/references/desktop-adaptation.md'), /deliberate exception/);
  const original = read('.agents/skills/reupmatic-ui-design/references/original-high-end-visual-design.md');
  const receipt = JSON.parse(read('research/integration-0.5/source-provenance.json'));
  assert.equal(createHash('sha256').update(original).digest('hex'), receipt.attachment_sha256);
});

test('UI uses shared tokens, reduced motion, explicit hidden state and no expensive decorative blur', () => {
  const css = read('app/ui/style.css') + read('app/ui/features/editor/editor.css'); const tokens = read('app/ui/design-tokens.css');
  assert.match(css, /@import "\.\/design-tokens\.css"/);
  assert.match(css, /prefers-reduced-motion/); assert.match(css, /\[hidden\]/);
  assert.match(css, /focus-visible/); assert.match(css, /\.surface-tray/);
  assert.doesNotMatch(css, /backdrop-filter|transition\s*:\s*all|will-change\s*:/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.match(tokens, /--font-ui: var\(--font-family-body\)/);
});


test('application color aliases resolve to Astryx rather than a parallel palette', () => {
  const tokens = read('app/ui/design-tokens.css');
  assert.doesNotMatch(tokens, /#[0-9a-f]{3,8}\b/i);
  for (const name of ['color-background-body', 'color-background-surface', 'color-text-primary',
    'color-text-secondary', 'color-error', 'focus-outline-color']) {
    assert.ok(tokens.includes(`var(--${name})`), name);
  }
});
