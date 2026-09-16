# Contributing to Reupmatic

## Toolchain and initial bootstrap

Use the Node 24 LTS line in `.nvmrc`, a virtual environment for Python (target 3.14; compatibility checks also cover 3.13), and native FFmpeg/ffprobe for media tests. The worker source baseline is Python 3.12+. This package has **not** established target-runtime or cross-platform compatibility.

The networked bootstrap gate is still open: there is no fabricated `package-lock.json`, and the source has not yet been formatted/linted by the new tools. On a development machine with registry access:

```sh
python -m venv .venv
# Activate .venv for desktop launches (or set PYTHON explicitly).
# The Python npm scripts discover .venv automatically.
node scripts/python.mjs -m pip install -r worker/requirements-dev.txt
npm install
npm run lint:fix
npm run format:python
npm run check
npm run check:python
npm run typecheck
npm run build
npm test
```

Review fixes, resolve remaining diagnostics (do not disable whole rule sets to force green), and commit the generated lockfile with the manifest. `npm install` is the one-time resolver here, **not** a replacement for `npm ci` after the lock is committed. No `--force` or `--legacy-peer-deps` workaround is preapproved. Investigate the timeline package's published workspace references if installation fails.

## Formatting and hooks

**Biome** owns JS/TS/JSX/TSX, JSON, CSS and supported HTML formatting/linting/import organization. `tsc` remains the type-check gate. **Ruff** covers first-party Python code; it is not another application runtime. There is no ESLint/Prettier/Husky duplication.

Lefthook installation runs during `npm install` only at this checkout's own Git root, outside CI. A ZIP is not a Git checkout; after placing it in a repository, run `npm run hooks:install`. Never install a hook into an unrelated parent repository.

- **Pre-commit:** check the staged-file paths using Biome and Ruff. No auto-fix, automatic staging, rendering, model downloads, network calls, or paid actions.
- **Pre-push:** typecheck and fast core/tooling tests. Native media and heavier checks belong in CI or explicit developer commands.

The hook checks the working-tree content at staged paths; it does not claim staged-blob isolation. Partially staged files with additional edits can therefore need manual attention, but the hook never rewrites or stages those hunks. Run `npm run lint:fix` or `npm run format:python` deliberately, review, and stage again. Hooks are a convenience; required CI protects merges even when local hooks are bypassed.

## Staying current without drifting builds

Prefer the newest **stable, compatible** releases; prerelease channels require an explicit isolated evaluation. Direct functional/tool dependencies are pinned. The initial `@types/*` compatibility ranges need resolution against the runtime line and must be pinned in the networked bootstrap, not guessed.

`.github/dependabot.yml` requests weekly npm, pip and GitHub Actions update PRs after the configuration is pushed to an enabled repository. Related patch/minor updates are grouped; majors remain separately reviewable. There is no auto-merge. `npm run deps:check` uses the existing `npm outdated` command (exit code 1 can mean updates are available); no custom updater engine is introduced.

For each dependency PR: review the changelog/engines/peers/licenses, install and commit the real lock, run CI, and check the relevant media/UI/packaging regressions. Model weights, GPU runtimes and shipping FFmpeg builds need their own checksums and smoke tests; Dependabot does not validate them. Keep release builds reproducible and do not update user projects/models silently on app launch.

## CI boundaries

The included workflow is **configuration only**, not a remotely executed result. Desktop source jobs cover Linux/Windows/macOS compilation and unit checks; they do not launch Electron or sign installers. Linux native-media jobs exercise Python and the bridge. They use test binaries, not selected redistribution artifacts. CI fails if the real npm lock is absent; it does not conceal this bootstrap gap.

First-party source has not yet passed Biome/Ruff or the upgraded TypeScript compiler in this execution environment. Historical checks under `research/` remain unchanged and are excluded from formatter rewrites; new evidence goes in `research/integration-0.3/`.

## Integration 0.3 test lanes

`npm run test:core` includes filesystem project tests and controlled render-lifecycle regressions; it does not launch Electron or FFmpeg. `npm run test:bridge` exercises actual native rendering, including the shared coordinator. `npm run test:e2e` builds and launches the real Electron application through Playwright; missing packages/tools fail rather than becoming skipped successes. Run it in a display session (or under Xvfb on Linux). Test-only application data is isolated by `tests/e2e/launch.mjs`; production launch has no test-data override.

The new Playwright dependency is pinned to 1.63.0 based on upstream release metadata checked on 2026-09-15, but is not installed in the recorded container. Biome/Lefthook/Ruff execution and actual target toolchain compilation still require the networked bootstrap. `npm run hooks:install` now uses the same own-repository/CI guard as `prepare`; it does not install into an unrelated parent Git repository.

Project v1 stores current single-video/subtitle work, not a reusable profile or the complete future timeline. Opening a project asks for the original video and compares its SHA-256 before exposing it to the renderer. A moved file with the same bytes is acceptable; a different file is not silently substituted. Document schema changes and migration before extending persistence.

## Integration 0.4 handoff

The owner is handling dependency setup and full runtime checks later. Continue scoped features without repeatedly running known-blocked installation attempts. Maintain real tests and record unexecuted gates honestly. New core tests include SQLite journal/filesystem cases; bridge tests include an actual saved queue → Python → FFmpeg → output-folder scenario. `test:e2e` includes the new EN/VI batch/reopen scenario. No new package versions are selected in this pass, and no successful formatter or hook run is implied.


## Local UI skill and folder-intake preview

Before UI changes read [.agents/skills/reupmatic-ui-design/SKILL.md](.agents/skills/reupmatic-ui-design/SKILL.md). The original reference and explicit desktop adaptation are included. Use `app/ui/design-tokens.css`; no new UI framework, icon dependency or downloaded font is required by this pass. Biome/Ruff/Lefthook still need execution after setup.

After a genuine install/build, `npm run start:automation` launches the **source-only** local folder preview. It is refused for packaged apps and does not simulate a paid account. Save/start a folder rule, then explicitly start the shared queue; pausing the queue does not stop intake. Normal launch leaves new automation operations unavailable until real entitlement integration exists.

`npm run test:watcher` requires installed Chokidar and exercises real OS events; `npm run test:e2e` includes EN/VI folder navigation, actual rendering and screenshots under `.test-artifacts/`. Read the original first-run-scope and readiness caveats in [folder-intake.md](specs/folder-intake.md). Do not count a controlled watcher handle as a live observation test or a screenshot file's existence as human visual review.
