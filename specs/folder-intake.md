# Local Folder Intake — Integration 0.5

> English implementation note, not the complete Automation spec or approval of commercial/lifecycle policy. UI supports EN/VI. Entry: SCR-04; shared queue: [batch-jobs.md](batch-jobs.md).

## Implemented path

Native source/output folder choice → save a paused rule → explicitly start monitoring → stable candidate file → persistent shared batch job → existing Python/FFmpeg MP4 output. The shared render queue must also be started once; starting monitoring does not silently resume unrelated manual jobs. A visible message explains when intake is running while rendering is paused.

No per-video approval or mandatory profile. Current folder jobs preserve original audio when present; they do not yet attach SRT, call OCR/LaMa/STT/TTS, classify, crawl, spend credits or publish. Those capabilities remain in the full scope, not removed. Saved rules are immutable in this integration; richer workflow editing/versioning is pending.

## FI-01 — Native folder authority and development gate

Renderer sends opaque IDs from native folder pickers, booleans for initial scope/subfolders, or a known rule ID. It cannot submit arbitrary paths, executables, tokens or permissions. The host's source-only `REUPMATIC_DEV_AUTOMATION=1` gate is enabled through `npm run start:automation`; packaged builds cannot use it. Production Plus entitlement verification remains unimplemented and fail-closed for this feature. The interface says development preview; it never claims a verified Plus account.

## FI-02 — Intake rules

| Concern | Integration behavior |
|---|---|
| First start | User explicitly chooses existing + future files, or new/changed files after the first inventory. Saving alone does not inventory or process files. Initial inventory must complete before its baseline is committed. |
| New-only definition | Baseline stores each existing path and its size/mtime/ctime/device/inode fingerprint. Unchanged baseline versions are skipped. A renamed baseline file is a new path and may be admitted; this is not a historical content-index promise. |
| Readiness | Chokidar uses awaitWriteFinish; reconciliation separately observes an unchanged fingerprint for 2 seconds, hashes the file, then checks the fingerprint again. Stability is a heuristic, not proof a producer has closed its file. Prefer writing a temporary non-video suffix and renaming once complete. The queue revalidates content at execution. |
| Extensions | MP4, MOV, MKV, WebM, AVI, case-insensitive. Hidden files, temporary non-video extensions, empty files and symlinks are excluded. Format validity is checked in the existing media path; one broken file fails its own job. |
| Subfolders | Explicit checkbox. Recursion is bounded to depth 32 / 10,000 visited entries; exceeding a bound is reported, not treated as a complete inventory or a Plus limit. |
| Duplicates | Content SHA-256 per rule deduplicates admitted videos across later events, copies and renames. Different content under the same path is a new version. Failed/cancelled admitted jobs use queue retry rather than silently creating another job. Separate rules may intentionally admit the same source. |
| Output loops | A dedicated output child folder is pruned. Same/ancestor output roots, workspace inclusion and direct cross-rule output-to-source chains are rejected in this integration. All rule outputs and known batch-generated file paths are excluded from inventory. General intentional A→B workflow chaining is pending, not globally removed from product scope. |
| Durable admission | Batch group ID derives from rule ID + content hash. Queue commit precedes intake receipt; after a crash, a missing receipt reuses the committed job rather than creating another. Jobs live only in the existing batch queue; folder SQLite holds configs/baselines/receipts. |
| Start/pause/quit | Start is explicit. Pause stops new intake, not admitted jobs. Close awaits in-flight admission and watcher attachment; app quit stops monitoring. All rules reopen paused. Reconciliation on restart catches not-yet-admitted files under the chosen baseline. No always-on/cloud promise. |
| Events and reconciliation | Chokidar observes changes; a coalesced scan plus a 30-second reconciliation handles missed events. Timings are reversible engineering defaults, not a responsiveness guarantee. |
| Errors | Missing folders, watcher failure, queue capacity and individual filesystem errors remain visible. No automatic deletion, paid fallback, fake success or background privilege extension. |

## FI-03 — Shared state and UI

Automation owns rule creation/list/start/pause; Batch & jobs owns per-item render/progress/cancel/retry/output. `admitted` counts intake receipts, including jobs that later fail; it is not a successful-export metric. Queue changes refresh the same monitor snapshot; no second job list/calendar is invented. Native-picked paths remain local data and are not translated. Existing Editor stays mounted when switching areas to retain edits.

## Acceptance / evidence

Core tests: `tests/folder.test.mjs` (real files/SQLite; controlled watcher handles). Native test: `tests/folder-native.test.mjs` (real reconciliation → existing queue → Python/FFmpeg; no OS-event claim). Installed library gate: `tests/chokidar.test.mjs`. Full EN/VI gate: `tests/e2e/folder.e2e.mjs`, including screenshots for human visual review. The last two require owner-side setup; source code is not passing runtime evidence.

See [current results](../research/integration-0.5/RESULTS.md) and the [UI skill](../.agents/skills/reupmatic-ui-design/SKILL.md). Later provider/model integration must preserve these shared queue and file-identity boundaries.
