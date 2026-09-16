import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkStructure, location, projectRoot, readSystemMap } from './system-structure.mjs';

export function readTraceability(root = projectRoot) {
  return JSON.parse(readFileSync(location(root, 'docs/planning/scope-traceability.json'), 'utf8'));
}

export function checkTraceability(root = projectRoot) {
  const trace = readTraceability(root);
  const map = readSystemMap(root);
  const scopes = new Set(
    Array.from({ length: 14 }, (_, index) => `SC-${String(index + 1).padStart(2, '0')}`),
  );
  if (
    trace.format !== 'reupmatic.scope-traceability' ||
    trace.version !== 1 ||
    trace.authority !== 'BUSINESS_SCOPE.md' ||
    trace.source_version !== map.source_version
  )
    throw new Error('Invalid traceability version/authority');
  const source = readFileSync(location(root, trace.authority), 'utf8');
  const ids = new Set();
  const modules = new Set(map.modules.map((module) => module.id));
  const requireFile = (name) => readFileSync(location(root, name), 'utf8');
  const moduleIds = (item) => {
    if (!item.modules?.length || item.modules.some((id) => !modules.has(id)))
      throw new Error(`Unknown module: ${item.id}`);
  };
  const identity = (item, pattern) => {
    if (!pattern.test(item.id) || ids.has(item.id))
      throw new Error(`Invalid/duplicate identity: ${item.id}`);
    ids.add(item.id);
    if (
      !['partial', 'planned'].includes(item.status) ||
      !item.title?.trim() ||
      !item.remaining?.trim()
    ) {
      throw new Error(`Completion evidence/gaps missing: ${item.id}`);
    }
    moduleIds(item);
  };
  for (const feature of trace.features) {
    identity(feature, /^SC-\d{2}-F\d{2}$/);
    if (!scopes.has(feature.scope) || !feature.id.startsWith(`${feature.scope}-`))
      throw new Error(`Unknown scope: ${feature.id}`);
    if (!feature.specs?.length) throw new Error(`Missing specification: ${feature.id}`);
    for (const spec of feature.specs) requireFile(spec);
    if (feature.status === 'partial' && !feature.delivered?.trim())
      throw new Error(`Missing implemented slice: ${feature.id}`);
  }
  for (const flow of trace.flows) {
    identity(flow, /^FLOW-\d{2}$/);
    if (!flow.scope?.length || flow.scope.some((scope) => !scopes.has(scope)))
      throw new Error(`Unknown flow scope: ${flow.id}`);
    if (
      !Array.isArray(flow.steps) ||
      flow.steps.length < 2 ||
      flow.steps.some((step) => !step.trim())
    )
      throw new Error(`Incomplete flow: ${flow.id}`);
  }
  for (const scope of scopes) {
    if (
      !source.includes(`### ${scope} `) ||
      !trace.features.some((item) => item.scope === scope) ||
      !trace.flows.some((flow) => flow.scope.includes(scope))
    )
      throw new Error(`Unmapped scope: ${scope}`);
  }
  const expected = ['sources', 'editor', 'channels', 'automation', 'settings'];
  if (trace.screens.length !== 5 || new Set(trace.screens.map((screen) => screen.area)).size !== 5)
    throw new Error('Five task areas required');
  expected.forEach((area, index) => {
    const screen = trace.screens.find((item) => item.id === `SCR-0${index + 1}`);
    if (screen?.area !== area || !modules.has(screen.module))
      throw new Error(`Missing screen: ${area}`);
  });
  if (
    trace.modes.length !== 3 ||
    !['direct-editing', 'user-started-batch', 'automation'].every((mode) =>
      trace.modes.includes(mode),
    )
  ) {
    throw new Error('Three independent modes required');
  }
  for (const name of [...trace.acceptance_sources, ...trace.open_policy_sources]) requireFile(name);
  return {
    scopes: scopes.size,
    screens: trace.screens.length,
    modules: modules.size,
    features: trace.features.length,
    flows: trace.flows.length,
  };
}

export function coverageMarkdown(trace) {
  const lines = [
    `# Scope delivery and remaining work — ${trace.source_version}`,
    '',
    'Generated from `scope-traceability.json`. Business authority remains `BUSINESS_SCOPE.md` and its linked specifications.',
    '',
    '**Partial is not complete. Planned paths and `.gitkeep` markers are not implemented features.**',
    '',
    'Direct editing, user-started batch and Automation remain independent modes. UI language does not change content or schedule instants.',
    '',
    '## Five task areas',
    '',
    '| ID | Area | Owner |',
    '|---|---|---|',
  ];
  for (const screen of trace.screens)
    lines.push(`| ${screen.id} | ${screen.area} | ${screen.module} |`);
  for (let number = 1; number <= 14; number++) {
    const scope = `SC-${String(number).padStart(2, '0')}`;
    lines.push('', `## ${scope}`, '');
    for (const feature of trace.features.filter((item) => item.scope === scope)) {
      lines.push(
        `### ${feature.id} — ${feature.title}`,
        '',
        `**${feature.status}** · Owners: ${feature.modules.join(', ')}`,
        '',
        `Delivered slice: ${feature.delivered || 'None.'}`,
        '',
        `Remaining: ${feature.remaining}`,
        '',
        `Authority: ${feature.specs.map((spec) => `[${spec}](../../${spec})`).join(', ')}`,
        '',
      );
    }
  }
  lines.push('## Cross-module flows', '');
  for (const flow of trace.flows)
    lines.push(
      `### ${flow.id} — ${flow.title}`,
      '',
      `**${flow.status}** · ${flow.scope.join(', ')} · Owners: ${flow.modules.join(', ')}`,
      '',
      flow.steps.join(' → '),
      '',
      `Remaining: ${flow.remaining}`,
      '',
    );
  lines.push(
    '## Acceptance and policy',
    '',
    'Specification acceptance lists remain authoritative. Traceability validates coverage and ownership, not execution or acceptance-test completion.',
    '',
    ...trace.acceptance_sources.map((name) => `- [${name}](../../${name})`),
    '',
    'Open decisions are not defaults: ' +
      trace.open_policy_sources.map((name) => `\`${name}\``).join(', ') +
      '.',
    '',
  );
  return lines.join('\n');
}

export function systemMarkdown(map) {
  const lines = [
    `# System map — source ${map.source_version}`,
    '',
    'Generated from `docs/architecture/system-map.json`. Business scope and its linked specifications remain authoritative.',
    '',
    '**Partial is a bounded source implementation. Planned means reserved paths only; `.gitkeep` is not executable code or acceptance evidence.**',
    '',
    '## Five product areas',
    '',
    'Sources · Editor · Channels & Affiliate · Automation · Settings.',
    'Profiles and the shared queue are secondary surfaces, not extra product areas.',
    '',
    '## Capability ownership',
    '',
    '| Capability | Scope | State | Remaining work |',
    '| --- | --- | --- | --- |',
  ];
  for (const module of map.modules)
    lines.push(
      `| ${module.title} | ${module.scope.join(', ')} | ${module.status} | ${module.remaining} |`,
    );
  lines.push(
    '',
    '## Safe maintenance',
    '',
    'Run `npm run structure:scaffold` to create only missing reserved markers. Existing files are never truncated.',
    'Run `npm run structure:check`, `npm run scope:check` and `npm run test:structure` before packaging.',
    'Retained source paths are protected by `docs/architecture/retained-paths.json`; intentional moves must have a recorded, real destination.',
    'Update machine-readable maps deliberately and run `npm run scope:generate` to refresh this file and the coverage report.',
    '',
    'The map preserves scope and ownership, not obsolete APIs. Greenfield development uses one current contract, without compatibility shims or migrations.',
    'Do not remove a planned module because it is empty or report a disabled screen as an implementation. `.gitkeep` is not a backup.',
    '',
    '## Detailed planning',
    '',
    '[Feature and flow coverage](docs/planning/scope-coverage.md) records all SC-01–SC-14 slices and remaining gaps.',
    '[Implementation sequence](docs/planning/implementation-sequence.md) orders remaining capabilities by dependency.',
    '[Source ownership](docs/architecture/source-layout.md) describes runtime responsibilities.',
    '',
    `The current delivered version is ${map.source_version}; the next minor archive is ${map.source_version.split('.')[0]}.${Number(map.source_version.split('.')[1]) + 1}.0. Never overwrite an earlier archive.`,
    '',
  );
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== '--write'))
      throw new Error('Usage: scope-traceability.mjs [--write]');
    checkStructure();
    const report = checkTraceability();
    for (const [relative, expected] of [
      ['docs/planning/scope-coverage.md', coverageMarkdown(readTraceability())],
      ['SYSTEM_MAP.md', systemMarkdown(readSystemMap())],
    ]) {
      const name = location(projectRoot, relative);
      if (args.includes('--write')) writeFileSync(name, expected);
      else if (readFileSync(name, 'utf8') !== expected)
        throw new Error('Regenerate scope maps: npm run scope:generate');
    }
    console.log(report);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
