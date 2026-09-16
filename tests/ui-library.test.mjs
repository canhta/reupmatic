import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(path.join(root, name), 'utf8');
function components(directory = 'app/ui', pattern = /\.tsx$/) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const name = `${directory}/${entry.name}`;
    return entry.isDirectory() ? components(name, pattern) : pattern.test(name) ? [name] : [];
  });
}

test('one UI system complements, rather than replaces, media libraries', () => {
  const manifest = JSON.parse(read('package.json'));
  for (const name of ['@astryxdesign/core', '@astryxdesign/theme-neutral', '@stylexjs/stylex',
    '@xzdarcy/react-timeline-editor', 'wavesurfer.js', 'jassub']) {
    assert.ok(manifest.dependencies[name], name);
  }
  assert.ok(manifest.devDependencies['@astryxdesign/cli']);
  assert.match(read('AGENTS.md'), /UI library policy/);
});

test('application uses library controls, not a parallel primitive implementation', () => {
  const forbidden = /<(?:button|input|textarea|select|option|table|thead|tbody|tr|td|th|dialog|progress)\b/;
  for (const name of components()) {
    assert.doesNotMatch(read(name), forbidden, name);
    assert.doesNotMatch(read(name), /from ['"]@astryxdesign\/core['"]/, name);
    assert.doesNotMatch(read(name), /window\.confirm\(/, name);
  }
});

test('theme, language and layer order are explicit and shared', () => {
  const provider = read('app/ui/design-system/DesignSystemProvider.tsx');
  assert.match(provider, /<Theme/);
  assert.match(provider, /InternationalizationProvider/);
  assert.match(provider, /i18n\.(?:language|resolvedLanguage)/);
  const css = read('app/ui/style.css');
  assert.match(css, /@layer reset, app-base, astryx-base, astryx-theme, app;/);
  assert.match(css, /@astryxdesign\/core\/reset\.css/);
  assert.match(css, /@astryxdesign\/core\/astryx\.css/);
  assert.match(css, /@astryxdesign\/theme-neutral\/theme\.css/);
  assert.doesNotMatch(css, /(?:^|\n)button[, :{]|(?:^|\n)input[, :{]|(?:^|\n)textarea[, :{]|(?:^|\n)select[, :{]/);
});

test('Astryx selections have a maintained catalogue and task-level rationale', () => {
  const inventory = JSON.parse(read('docs/ui/astryx-inventory.json'));
  assert.equal(inventory.targetVersion, JSON.parse(read('package.json')).dependencies['@astryxdesign/core']);
  assert.equal(typeof inventory.packageVerified, 'boolean');
  for (const name of components()) {
    for (const match of read(name).matchAll(/from ['"]@astryxdesign\/core\/([^'"]+)['"]/g)) {
      assert.ok(inventory.decisions[match[1]], `${name}: undocumented selection ${match[1]}`);
      assert.ok(inventory.decisions[match[1]].reason.length > 30);
    }
  }
  assert.match(read('AGENTS.md'), /Astryx discovery and selection/);
  assert.match(read('docs/ui/astryx-component-map.md'), /Not a component-count target/);
});

test('navigation and disclosure use library semantics, not button lookalikes', () => {
  assert.match(read('app/ui/App.tsx'), /<AppShell/);
  assert.doesNotMatch(read('app/ui/App.tsx'), /<main\b/);
  assert.match(read('app/ui/shell/WorkspaceNavigation.tsx'), /<SideNavItem/);
  assert.match(read('app/ui/features/batch/BatchPanel.tsx'), /<Collapsible/);
  for (const name of components()) assert.doesNotMatch(read(name), /<(?:details|summary)\b/, name);
});

test('choices with different execution consequences remain visible before submission', () => {
  assert.match(read('app/ui/features/folders/FolderRuleForm.tsx'), /<RadioList/);
  assert.match(read('app/ui/features/vision/InpaintControls.tsx'), /<RadioList/);
  assert.match(read('app/ui/features/editor/TimeInput.tsx'), /NumberInput/);
  assert.doesNotMatch(read('app/ui/features/editor/TimeInput.tsx'), /core\/TimeInput/);
});

test('workspace CSS does not reach into library controls or shell landmarks', () => {
  function styles(directory = 'app/ui') {
    return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
      const name = `${directory}/${entry.name}`;
      return entry.isDirectory() ? styles(name) : name.endsWith('.css') ? [name] : [];
    });
  }
  const controls = /(?:^|[\s>,+~])(?:button|input|textarea|select|table|thead|tbody|tr|td|th|dialog|progress|main|footer)(?=[\s,.#:[{]|$)/;
  for (const name of styles()) {
    for (const line of read(name).split('\n')) {
      if (line.includes('{')) assert.doesNotMatch(line.split('{')[0], controls, name);
    }
  }
  assert.match(read('app/ui/features/editor/CuePanel.tsx'), /<Toolbar/);
});


test('literal UI messages exist in both application languages', () => {
  const base = read('app/ui/i18n.ts');
  const resources = { en: base.split('export const vi:')[0], vi: base.split('export const vi:')[1] };
  const modules = [...base.matchAll(/import \{ (\w+)En, (\w+)Vi \} from ['"](.+\/i18n)['"]/g)];
  assert.ok(modules.length >= 11, 'every feature resource must be discovered');
  for (const [, feature, counterpart, filename] of modules) {
    assert.equal(counterpart, feature);
    const [en, vi] = read(`app/ui/${filename}.ts`).split(`export const ${feature}Vi:`);
    assert.ok(en && vi, filename);
    resources.en += en;
    resources.vi += vi;
    assert.match(base.split('export const vi:')[0], new RegExp(`\\.\\.\\.${feature}En`));
    assert.match(base.split('export const vi:')[1], new RegExp(`\\.\\.\\.${feature}Vi`));
  }
  for (const name of components('app/ui', /\.(?:ts|tsx)$/)) {
    for (const [, key] of read(name).matchAll(/\bt\(['"]([^'"]+)['"]/g)) {
      for (const [locale, source] of Object.entries(resources)) {
        assert.match(source, new RegExp(`\\b${key}\\s*:`), `${name}: ${locale}.${key}`);
      }
    }
  }
});

test('model setup messages refer to the shipped development guide', () => {
  const messages = read('app/ui/features/vision/i18n.ts');
  assert.doesNotMatch(messages, /worker\/requirements-vision\.txt|models\/README\.md/);
  assert.match(messages, /docs\/development\/local-models\.md/);
  assert.ok(read('docs/development/local-models.md').includes('REUPMATIC_MODEL_MANIFEST'));
});

test('Electron flows target library interactions rather than native select elements', () => {
  for (const name of ['editor', 'batch', 'folder']) {
    const source = read(`tests/e2e/${name}.e2e.mjs`);
    assert.doesNotMatch(source, /\.selectOption\(/, name);
    assert.match(source, /chooseLocale\(/, name);
  }
  const editor = read('tests/e2e/editor.e2e.mjs');
  assert.match(editor, /getByRole\('alertdialog'\)/);
  assert.doesNotMatch(editor, /textarea\[aria-label=/);
});


test('Sources stages batches and exposes storage consequences before import', () => {
  const source = read('app/ui/features/library/SourcesWorkspace.tsx');
  assert.match(source, /<TabList[^>]*role="tablist"/);
  assert.match(source, /role="tabpanel"/);
  assert.match(source, /library.clearSelection/);
  assert.doesNotMatch(source, /batchEnqueue|batchResume|\.render\(/);
  assert.match(read('app/ui/features/library/LibraryImport.tsx'), /<RadioList/);
  assert.match(read('app/ui/features/batch/BatchPanel.tsx'), /isOpen={queue.expanded}/);
  assert.equal((read('app/ui/App.tsx').match(/useBatchQueue\(/g) ?? []).length, 1);
});

test('public assets and local settings have actual application wiring', () => {
  assert.match(read('vite.config.ts'), /publicDir: '\.\.\/\.\.\/public'/);
  assert.match(read('app/ui/shell/WorkspaceNavigation.tsx'), /brand\/logo-white\.svg/);
  assert.match(read('app/ui/features/settings/SettingsPanel.tsx'), /settingsPickOutput\(/);
  assert.match(read('app/ui/features/settings/LocalModelSetup.tsx'), /settingsPickModels\(/);
  assert.match(read('app/ui/features/vision/useVisionJob.ts'), /onModelsChanged\(/);
});

test('one domain processing form serves Editor, batch and folders without starting work', () => {
  for (const name of ['editor/RenderControls.tsx', 'batch/BatchPanel.tsx', 'folders/FolderRuleForm.tsx']) {
    assert.match(read(`app/ui/features/${name}`), /<ProcessingOptions/);
  }
  const form = read('app/ui/features/processing/ProcessingOptions.tsx');
  for (const component of ['CheckboxInput', 'RadioList', 'Selector', 'NumberInput', 'Banner']) {
    assert.match(form, new RegExp(`<${component}`));
  }
  assert.doesNotMatch(form, /window\.reupmatic|useEffect|\.render\(|batchEnqueue|folderCreate/);
  assert.match(read('app/ui/features/vision/InpaintControls.tsx'), /<MaskRegionFields/);
  assert.match(form, /<MaskRegionFields/);
  assert.match(form, /processingReviewLimit/);
  assert.doesNotMatch(read('app/ui/i18n.ts'), /AI processing is not connected to batch|No cloud calls, credits, AI or posting/);
});
