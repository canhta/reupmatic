import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { projectRoot, readSystemMap } from '../scripts/system-structure.mjs';
import { checkTraceability, coverageMarkdown, readTraceability, systemMarkdown } from '../scripts/scope-traceability.mjs';

function fixture(t, change) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'reupmatic-scope-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  cpSync(path.join(projectRoot, 'docs/architecture'), path.join(root, 'docs/architecture'), { recursive: true });
  cpSync(path.join(projectRoot, 'docs/planning'), path.join(root, 'docs/planning'), { recursive: true });
  cpSync(path.join(projectRoot, 'specs'), path.join(root, 'specs'), { recursive: true });
  for (const name of ['BUSINESS_SCOPE.md', 'DECISIONS.md']) cpSync(path.join(projectRoot, name), path.join(root, name));
  const trace = readTraceability(root); change(trace);
  writeFileSync(path.join(root, 'docs/planning/scope-traceability.json'), JSON.stringify(trace));
  return root;
}

test('all scope groups, five screens and three modes have feature and flow traceability', () => {
  assert.deepEqual(checkTraceability(), { scopes: 14, screens: 5, modules: 22, features: 76, flows: 24 });
  assert.equal(readFileSync(path.join(projectRoot, 'docs/planning/scope-coverage.md'), 'utf8'), coverageMarkdown(readTraceability()));
});

test('omitting a scope, screen, mode or specification breaks the coverage guard', t => {
  const changes = [
    trace => { trace.features = trace.features.filter(item => item.scope !== 'SC-04'); },
    trace => { trace.screens.pop(); },
    trace => { trace.modes = ['automation']; },
    trace => { trace.features[0].specs = ['specs/nonexistent.md']; },
    trace => { trace.flows = trace.flows.filter(flow => !flow.scope.includes('SC-12')); },
  ];
  for (const change of changes) assert.throws(() => checkTraceability(fixture(t, change)));
});

test('unknown ownership, duplicate IDs and false completion declarations are rejected', t => {
  for (const change of [
    trace => { trace.features[0].modules = ['unowned']; },
    trace => { trace.features.push(trace.features[0]); },
    trace => { trace.features[0].status = 'complete'; },
    trace => { trace.flows[0].steps = ['Done']; },
    trace => { trace.features[0].remaining = ''; },
  ]) assert.throws(() => checkTraceability(fixture(t, change)));
});

test('independent endpoints and unfinished major capabilities remain explicit rather than hidden by scaffolding', () => {
  const trace = readTraceability();
  for (const phrase of ['download-only', 'OCR', 'classif', 'cloud', 'recovery']) {
    assert.ok(trace.flows.some(flow => (flow.title + flow.remaining).toLowerCase().includes(phrase.toLowerCase())), phrase);
  }
  for (const scope of ['SC-01', 'SC-04', 'SC-08', 'SC-10', 'SC-12']) {
    assert.ok(trace.features.some(feature => feature.scope === scope && feature.status === 'planned'));
  }
  const editing = trace.features.filter(feature => feature.scope === 'SC-03');
  assert.ok(editing.every(feature => feature.status === 'partial' && feature.remaining.trim()));
  assert.ok(editing.some(feature => /multi-clip|composition/i.test(feature.remaining)));
  assert.ok(editing.some(feature => /replacement audio|voiceover/i.test(feature.remaining)));
});

test('the human system map derives ownership and gaps from the current machine map', () => {
  assert.equal(readFileSync(path.join(projectRoot, 'SYSTEM_MAP.md'), 'utf8'), systemMarkdown(readSystemMap()));
});
