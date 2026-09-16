# Reupmatic 0.4 — Manual Batch & Saved Queue

> Date: 2026-09-15. Source implementation plus bounded Linux core/native checks.
> The owner deferred dependency setup and full runtime testing. No registry installation, formatter/hook installation or UI launch was attempted in this pass.

## Delivered code

| Area | Changes and evidence boundary |
|---|---|
| Manual batch UI | `app/ui/BatchPanel.tsx`, EN/VI resources, preload and `app/electron/batch-ipc.ts`: native multi-select, per-item SRT, output-folder choice, saved queue, start/pause/cancel/retry and output reveal. Wired into the existing Editor without replacing its subtitle workspace. **Source-only, not executed Electron evidence.** |
| Saved jobs | `app/core/batch-store.ts`: actual local SQLite rows, immutable file/config snapshots, idempotent submission, explicit states, attempt counts, claim/cancel/retry, and reopen recovery. Core tests use real temporary databases. |
| Execution | `app/core/batch-queue.ts`: one batch item at a time through the same RenderCoordinator/Python worker; re-register/hash-check inputs; isolate bad files; pause following work after a dead runtime; wait for an active Editor render. Controlled lifecycle tests are distinguished from real native execution. |
| Safe outputs | `app/core/batch-output.ts`: stable filenames, verify temporary file hash, exclusive hardlink commit, no overwrite, reconcile identical output after a lost acknowledgement. The selected filesystem must support hardlinks. No all-filesystem or power-loss guarantee. |
| Host boundary | Explicit IPC verbs, native-picker IDs, no arbitrary renderer paths, one-app-instance journal ownership and conditional SQLite load. Queue initialization failure preserves individual editing. **Electron transport, locking and runtime availability are untested here.** |
| Contracts/docs | Batch request schema/example, behavior spec, architecture binding note, README, AGENTS and task plan. Existing dependency/tooling choices and full product scope remain. |

## Checks executed

| Lane | Result |
|---|---|
| Core TypeScript compile | Passed with the preinstalled TypeScript 5.8.3 and external Node declarations. Not the pinned target TypeScript toolchain or a whole-app build. |
| Node tests | **50 passed**: previous regression suites, 12 new SQLite/controlled lifecycle/output checks and one real saved-batch/native integration. |
| Python/native/schema | **21 passed, 1 skipped** across 22 tests. The absent real `pysubs2` round-trip is still skipped. One new batch-admission schema test is included. |
| Total | **71 passed, 1 skipped** within these bounded lanes. Not 71 UI/model/platform checks. |

Exact commands and logs: [commands](command-results.json), [environment](environment.json), [compiler](core-compile.txt), [Node](node-tests.txt), [Python](python-tests.txt), [batch-focused run](batch-tests.txt).

The real new integration creates a synthetic local MP4 and an invalid media file, submits both to SQLite, runs the common TypeScript → Python → FFmpeg path, observes failure isolation, verifies a concrete MP4 and unchanged original hash, reopens the journal without reprocessing the finished job, then detects a changed source before dispatch. The journal-reopen portion retains the same running worker process; it is **not** a full Electron/process-crash restart test. Other queue/cancellation orderings use controlled renderer ports over real SQLite/files and are labeled accordingly in the tests.

The existing native suite still covers small lossless sample/full equivalence and source/audio/caching behavior. Its scope has not become a performance benchmark because a saved queue was added.

## Deliberately not claimed

- No successful dependency installation or lockfile; existing version targets were carried forward, not re-certified as today's latest releases.
- No Biome/Ruff formatting pass, installed Lefthook, target compiler/full React build, JASSUB/browser visual parity, Electron launch, Windows/macOS installer, remote CI, or actual GPU/model execution.
- New EN/VI `tests/e2e/batch.e2e.mjs` is runnable source for owner-side setup; its UI and app-restart scenarios have not executed here.
- No folder watcher, full workflow scheduler, Plus gate, billing policy, cloud, Douyin/API integration, OCR/LaMa implementation or automatic publishing in this slice.
- One active batch job and the admission/history bounds are temporary integration safety limits, not Free/Plus pricing decisions.
- Partial encode resumption, orphan temporary-file cleanup, cross-platform output filesystem support and complete Editor/batch parameter mapping remain work.

## Binding choice and primary references

This slice conditionally uses the runtime's built-in `node:sqlite` instead of adding a native-addon installation before the owner handles setup. Node documents `DatabaseSync`/prepared statements; Electron's app API documents single-instance control, and shell exposes Show in folder. These sources support API selection, not application test results. A reported historical Electron SQLite regression is why runtime availability remains an explicit check rather than inferred from the system Node pass.

Reviewed on 2026-09-15:

- `https://nodejs.org/api/sqlite.html`
- `https://www.electronjs.org/docs/latest/api/app`
- `https://www.electronjs.org/docs/latest/api/shell`
- `https://github.com/electron/electron/issues/47671`

The local Node 22.16.0 SQLite binding reports an ExperimentalWarning and SQLite 3.49.1. It is not the selected Node 24/Electron runtime. Missing binding/database errors isolate batch instead of resetting data or disabling the individual Editor. The initial journal queries run in the host; the larger intended utility-process coordinator remains a separate integration gate.

## Next implementation

Continue INT-07 folder intake/reconciliation using the same journal/worker. Keep initial backlog selection, readiness, output-loop prevention and saved job identity explicit. Preserve deferred setup/E2E as acceptance work, not a repeated prerequisite for independent coding.
