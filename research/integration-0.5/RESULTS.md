# Reupmatic 0.5 — Local UI Skill & Folder Intake

> Date: 2026-09-15. Source implementation plus bounded Linux checks. No full Electron build, actual UI screenshot review, installer or performance benchmark is claimed. Owner-side setup/E2E remains deferred.

## Delivered

| Area | Scope |
|---|---|
| Project-local skill | `.agents/skills/reupmatic-ui-design/SKILL.md`, source reference, adaptation mapping and review checklist. Root AGENTS requires it before UI work. Original attachment SHA-256 matches the retained bytes. No global tool registration is claimed. |
| Visual integration | Shared graphite/mint tokens, typography/fallback, selective nested enclosures, compact desktop spacing, focus/status colors and reduced motion. UI source applies these to the shell/editor/queue/new Automation view without removing cue editing or timeline controls. No font binaries or new graphic engine. |
| Folder intake | Native-picked directories, explicit initial scope and subfolders, paused save/start/pause, persistent baseline/content receipts, stable-file checks, output-loop guards and existing batch admission. Stored jobs are not moved into another runner. |
| Production boundary | Source-only developer mode until real Plus verification exists. No fake account/credit state, paid/cloud operation, OCR/LaMa/dubbing or publishing. Watcher activation does not unpause unrelated queued work. |
| Tests/config | New core/design/native checks, JSON Schema, separate installed-Chokidar gate and EN/VI Electron scenarios/screenshot capture. CI is configuration only. |

## Executed results

| Lane | Actual result |
|---|---|
| Core compilation | Passed using installed TypeScript 5.8.3 with external Node types, not the declared target toolchain or whole-app typecheck. |
| Available Node lanes | **67 passed.** Includes 13 new filesystem/SQLite/intake tests, 3 local-skill/token checks and 1 actual folder reconciliation/native-render test. Controlled watcher handles do not count as OS-event validation. |
| Python/native/schema | **22 passed, 1 skipped.** The real pysubs2 round-trip remains skipped because the package is absent; new folder request validation rejects arbitrary paths/wrong types. |
| Bounded total | **89 passed, 1 skipped.** The blocked library gate below is separate, not counted as a pass or silently dropped. |
| Source inspection | TS/TSX parse check and EN/VI key comparison. See [syntax report](source-syntax.json). Not component typechecking, lint or interaction validation. |

The new native scenario creates a one-second 160×90 synthetic video and an invalid file. Real directory reconciliation admits both into SQLite; the existing TypeScript coordinator/Python/FFmpeg path produces one real MP4 and isolates the invalid input. The source hash remains unchanged; scanning again does not create a job for the output or duplicate the originals. **Chokidar was not used in this native scenario.**

Core tests cover stable observations, writes resetting readiness, explicit new-only baselines, duplicate renamed/copied admitted content, receipt failure after batch commit, paused/restarted rules, missed files while stopped, output/hidden/partial/symlink exclusions, loop rejection, missing-directory recovery, late attachment cancellation and shutdown ordering. The selected solid-color token pairs meet the project's 4.5:1 target; this is not a complete accessibility audit.

## Failed/not-run gates

The initial broad command `node --test tests/*.test.mjs` attempted the separate Chokidar test and failed module loading with `ERR_MODULE_NOT_FOUND`. The log is retained as [node-tests-initial.txt](node-tests-initial.txt). Running the explicitly available lanes afterward passed 67 checks; it does **not** repair or certify the missing package. `npm run test:watcher` remains an installation/OS gate.

No registry retry, new package/model installation, lockfile generation, Biome/Ruff/Lefthook execution, full build, actual Electron test, human screenshot review, GPU test, Windows/macOS run, signed installer or remote CI execution occurred. The existing stable-target manifest is not an installed dependency set. Chokidar 5.0.0 was source-reviewed, not installed. No result above certifies high-end visual quality or production Plus authorization.

Evidence: [environment](environment.json), [commands](command-results.json), [Node](node-tests.txt), [Python](python-tests.txt), [machine-readable results](results.json), [source provenance](source-provenance.json), [external source checks](source-checks.md).

## Continue after setup / independent feature work

Resolve a genuine dependency lock, run format/lint/typecheck/build, then `npm run test:watcher` and `npm run test:e2e`. Folder E2E captures actual screenshots under `.test-artifacts/`; inspect EN/VI, long paths, keyboard/IME and resized/reduced-motion states using the local skill checklist. Meanwhile INT-06 can add the missing OCR/LaMa adapter source through the existing worker, with actual inference still a distinct gate. No new Rust or general-purpose engine.
