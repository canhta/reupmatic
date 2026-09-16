# Reupmatic integration 0.3 — Evidence and Remaining Gates

> Date: 2026-09-15. Source implementation plus bounded Linux tests, not a packaged application or performance benchmark. [Environment](environment.json), [commands](command-results.json), [upstream checks](source-checks.md).

## Executed results

| Lane | Result | Evidence and qualification |
|---|---|---|
| Core TypeScript compilation | Passed | [Compiler log](core-compile.txt). Preinstalled TypeScript 5.8.3 and external Node declarations, **not** the declared TypeScript 7.0.2/Node 24 toolchain. |
| Node tests | **37 passed** | [TAP log](node-tests.txt). Prior regressions; seven project/filesystem checks; seven controlled coordinator lifecycle tests; one actual coordinator/native integration test. |
| Python/native/schema tests | **20 passed, 1 skipped** | [unittest log](python-tests.txt). Real pysubs2 round-trip remains skipped because the package is absent; the project JSON Schema adds one check. |
| Bounded total | **57 passed, 1 skipped** | No failures within these executable lanes. Blocked build/tool/UI attempts below are **not included as passes**. |

The existing native suite again checks 60 lossless decoded sample frames against the corresponding full-render interval, source immutability, audio, cache invalidation/corruption, cancellation and bad-item isolation. The new actual coordinator test renders a synthetic two-second 160×90 input through TypeScript → Python → FFmpeg, with empty cues and a registered SRT, checks cache reuse, and completes a good item after an unknown-asset failure. No model or paid-service calls occur.

Coordinator cancellation-during-preparation tests use a controlled worker port to force race orderings. They are not an Electron IPC test or actual pysubs2 execution. Project tests operate on real temporary files: Unicode round-trip, snapshot independence, strict validation, corrupted/oversized input, preservation on rejected save, and original/hardlink protection. They do not certify the native picker, power-loss durability, all filesystems, or the full future project model.

## Source changes

- `app/core/render-coordinator.ts` registers public operations before subtitle preparation, maps both stages' progress, prevents render dispatch after cancellation, and cleans up terminal operations. No-cue jobs skip subtitle setup. Desktop and developer batch both call this coordinator; it is not a durable scheduler.
- `app/core/project.ts` and `contracts/project.schema.json` implement bounded single-video/subtitle snapshots. Native UI actions are wired for save/open. The source-video chooser and SHA-256 comparison are host code still awaiting Electron execution; only underlying project I/O/validation is tested here.
- `assertCues` accepts untrusted input explicitly and rejects non-arrays, malformed entries, and unknown fields with stable errors.
- The Electron host checks the project virtualenv before falling back to a system interpreter. The renderer's global declaration is now an external-module augmentation. These are source corrections, not a full UI typecheck result.
- `tests/e2e/editor.e2e.mjs` and `launch.mjs` add two real Electron scenarios (EN/VI), isolated app data, fixture-controlled file pickers, text/timing/undo/redo, actual sample rendering and project reopen. No renderer/worker output is mocked. **Execution remains blocked before these scenarios start.**
- CI includes a Linux/Xvfb Electron lane; existing Windows/macOS source jobs, Lefthook/Biome/Ruff and weekly dependency configuration are retained. CI was not pushed or run remotely.

## Blocked attempts — not green gates

| Attempt | Actual outcome |
|---|---|
| Registry/lock resolution | Direct registry requests failed DNS. The [bounded npm lock attempt](npm-lock-attempt.txt) timed out; no lockfile or installed dependency tree was produced. |
| Biome | [`npm run check`](biome-attempt.txt) exited 127: binary absent. Formatting/linting has not passed. |
| Ruff | [`npm run check:python`](ruff-attempt.txt) exited 1: module absent. Ruff formatting/linting has not passed. |
| Full build | [`npm run build`](build-attempt.txt) exited 2: installed Node type declarations unavailable to the standard compiler configuration. The UI build was not reached. |
| Electron E2E | [Direct test invocation](electron-test-attempt.txt) failed module loading: `playwright` is not installed. Neither locale scenario executed; no screenshot or UI pass is claimed. |
| Hook setup | [Guarded hook install](hook-guard.txt) exited 0 by **skipping** a non-Git source directory. This is not Lefthook binary execution or an installed hook. |

Playwright 1.63.0 was added as a version-pinned proposed test dependency based on [upstream checks](source-checks.md). All actual version resolution, peer compatibility, formatter remediation, Electron preview behavior, target-OS packaging, GPU performance, OCR/LaMa and production Automation remain open gates. No model weights, fonts, native binaries or user media are included.

## Reproduce and continue

The exact local fallback commands are in [command-results.json](command-results.json). That environment-specific type-root is evidence only, not a project configuration requirement. In a networked checkout follow [CONTRIBUTING](../../CONTRIBUTING.md), resolve/commit a real lock, install tools, run format/lint/typecheck/build and the separate `test:core`, `test:bridge`, `test:python`, `test:e2e` lanes. Fix errors rather than marking missing components successful. [BUILD_PLAN](../../BUILD_PLAN.md) preserves remaining scope and maturity labels.
