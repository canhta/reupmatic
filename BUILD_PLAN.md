# Build Plan — Integration First

## Current source progress — 0.15.0 (2026-09-16)

The source handoff continues 0.14. Spoken-layer synthesis now uses explicit native
preset configuration, the existing worker queue, hash-verified WAV/receipt artifacts,
audition/manual review and stale-safe native export. Audio is natural and unaligned;
no soundtrack or text is replaced. Real SDK/models/voice quality and loaded UI gates
remain unverified. Evidence: `research/integration-0.15/RESULTS.md`.
Next archive: **0.16**, reviewed segment timing/alignment and explicit integration,
then full-duration mixing and durable speech recipes. Full remaining scope stays in
`docs/planning/implementation-sequence.md`. Older tables below are historical.

> Revision: integration-0.8 · Documentation: English · Scope baseline: v1.8.
> This is a sequencing plan, not an MVP cut or a promise of delivery dates. No Rust or new engine redesign.

## 1. Status vocabulary and next action

`TESTED-LOCAL` means the named checks ran in the recorded Linux environment. `SOURCE-ONLY` means code exists but the relevant runtime gate has not passed. `PENDING` means not implemented in this exercise. `BLOCKED-ENV` identifies an actual missing dependency/platform, not an owner question.

**Continue feature implementation without waiting for owner-side setup.** The owner explicitly deferred dependency installation and end-to-end testing. INT-01 remains a real release/build gate, but do not spend each implementation pass repeating failed registry/tool probes. Local checks with already-installed tools are useful; do not describe them as the deferred full UI/target-runtime test.

Integration 0.8 connects local OCR/LaMa recipes to Editor sample/full, manual batch and developer folder intake through the existing queue. Bounded actual-media tests use controlled AI adapters; real-model and UI acceptance remain separate gates. Library and Settings are implemented in 0.7. Next coherent feature candidates are generated-subtitle artifact export/review and remaining workflow/profile composition; online downloads, channels/account services and installers remain pending. Continue source work without repeating the owner-deferred setup attempts.

## 2. First integration tasks

| ID / status | Required context | Dependencies | Work / acceptance | Evidence or required test |
|---|---|---|---|---|
| INT-01 · BLOCKED-ENV | Architecture §1; reuse audit RU01–04; D-40–41 | None | Resolve Electron/React/timeline/WaveSurfer/JASSUB/pysubs2, capture exact artifacts, notices and lockfile. Verify the published timeline has no unusable workspace references. | Stable targets and CI/Dependabot configuration from 0.2 are retained; 0.3 adds the researched Playwright dependency. Registry DNS unavailable, lock-resolution timed out; no actual npm tree or lock. Biome/Lefthook/Ruff unavailable. `npm run check`, `npm run check:python`, `npm run typecheck`, and `npm run build` must pass on resolved dependencies. |
| INT-02 · TESTED-LOCAL, bounded | ED-AC02/06–08; contracts §1–4 | Native tools | TypeScript→Python request/progress/result/error/cancel; native sample/full path; source remains untouched; a failed item does not kill worker. | `tests/bridge.test.mjs`, `tests/test_worker.py`; Linux only. No durable queue claim. |
| INT-03 · SOURCE-ONLY | Editor §10; ED-R03/07/09; NAV-L10N | INT-01/02 | Native open, imported/manual cues, real text/timing changes, split/merge, undo/redo, scoped replace, seek/playhead sync. Keep display vs spoken text separate. | `npm run build`; actual Electron E2E in both locales, including Vietnamese IME, invalid timing and long tracks. Pure edit-command and render-order tests are not this gate. Integration-0.2 adds early-result correlation; actual Electron transport still needs E2E. |
| INT-04 · SOURCE-ONLY | ED-P02; NAV-L10N | INT-01/03 | JASSUB worker/WASM/fonts, WaveSurfer precomputed peaks, original vs processed sample, stale result/locale behavior, custom media protocol seek. | Installed UI tests and visual parity against native libass. Integration-0.2 range/file adapter tests passed, but browser seeking and JASSUB parity remain untested. No font redistribution in this package. |
| INT-05 · TESTED-LOCAL subset | ED-P04; AU-AC02/11; contracts | INT-02 | Developer batch of independent items uses the same client/worker; good item after bad item completes. | Node bridge + Python batch-isolation check. Manual batch UI source and SQLite journal now exist under INT-12. Full workflow/profile/AI overrides remain pending; UI runtime acceptance has not run. |
| INT-06 · SOURCE-ONLY + controlled native evidence | ED-R05/06; CA-R01; R-03/06/09 | INT-01/02 | Install actual OCR/LaMa adapters, timed OCR cues, manual/automatic masks, real video sample; no forced region/cue review. Retain separate classification output. | Authorized Chinese/English/Vietnamese fixtures; real model timings/memory/flicker/license results. Never count mock capability as passed. |
| INT-07 · PARTIAL (journal + folder intake) | AU-AC01–15; OP-P* and open policies | INT-02/05 | SQLite-backed TS coordinator, folder readiness/reconcile/deduplication, cancellation/restart, durable ownership and no output loops. No duplicated Python workflow rules. | Crash/restart, copying file, duplicate event, missing input and failed-item tests. Manual journal/retry foundation is implemented in INT-12; folder readiness/reconciliation/loop guards are implemented in INT-13; installed Chokidar, complete workflow scheduling and production policy gates remain pending. Product policy defaults remain subject to approval. |
| INT-08 · PENDING, early parallel gate | R-05/12/14; ST-AC02–09 | INT-01; repeat after model additions | Development package on Windows and macOS; native components and localized paths; later signing/update readiness. | Build/launch on actual target OS; no user-installed Python requirement in release. Do not infer a Windows/Mac pass from Linux. |
| INT-09 · SOURCE-ONLY tooling; bounded local checks | D-42–44; CONTRIBUTING | INT-01 for executable tools | Reupmatic identity, Lefthook check-only staged paths, Biome/Ruff format/lint, tsc, cross-platform source CI and weekly Dependabot. | Six local tooling/configuration tests passed; **not** a Lefthook/Biome/Ruff execution or remote CI pass. Complete initial format/diagnostics, real hook execution, lock and target compiler gates. |
| INT-10 · TESTED-LOCAL core; SOURCE-ONLY UI | Editor save/restore; D-34–36; project contract | INT-02; INT-01/03 for Electron | Save/open single-video cues and sample interval; verify source content; preserve edits on invalid project; no profile requirement. | `tests/project.test.mjs` executed on Linux. Native project picker/UI tests exist in `tests/e2e/editor.e2e.mjs` but are not executed. Full project/autosave remains pending. |
| INT-12 · CORE/NATIVE CHECKED; UI SOURCE-ONLY | SC-07, ED-P04, NAV-03, specs/batch-jobs.md; contracts §7 | INT-02; INT-01 for UI | Native multi-select, per-video SRT, saved SQLite queue, explicit start/pause/cancel/retry, stable snapshots/IDs, exclusive folder outputs and restart history. No copied sample cues or profile prerequisite. | `tests/batch.test.mjs`, `tests/batch-native.test.mjs`; EN/VI `tests/e2e/batch.e2e.mjs` exists but is unexecuted. Not a full Automation or shipping filesystem gate. |
| INT-13 · CORE/NATIVE CHECKED; UI/OS WATCHER SOURCE-ONLY | AU-AC02/07/08/11; specs/folder-intake.md; folder contract | INT-07/12; installed Chokidar for live events | Native directory IDs, explicit initial scope, baseline, stability, dedup receipts, output-loop guards, saved paused rules and shared queue admission. | `tests/folder.test.mjs`, `tests/folder-native.test.mjs`; separate `test:watcher` and EN/VI Electron test need installation. Never treat controlled watcher handles as Chokidar evidence. |
| INT-14 · SOURCE + STATIC GUARDS | D-45; local UI skill and source reference | Existing UI, deferred visual review | Byte-preserved reference; explicit desktop adaptation; AGENTS entry; shared typography/spacing/surface/motion/focus tokens; usable folder screen and retained subtitle controls. | `tests/design-skill.test.mjs` checks source/token invariants, not design quality. Inspect real screenshots, keyboard/IME, resized layouts, contrast beyond selected pairs and reduced motion after setup. |


## 3. Preserve the remainder of the product

These dependency groups remain in full scope; flesh out task-level contracts after the integration gates reveal actual requirements.

| Group | Coverage and prerequisite | Completion evidence |
|---|---|---|
| Editor/tool coverage | `specs/editor.md`: remaining video/audio controls, multi-clip mapping, styles/rules, source/translation/spoken text, project save/restore, optional file profiles; follow INT-03/04. | Every approved tool mapped to shared processing; full preview/export, undo, manual-edit protection and batch override checks. Never remove tools to fit a chosen component. |
| AI content pipelines | STT, translation, TTS/alignment, OCR/classification; `specs/content-analysis.md`, Architecture §4. | Real model artifacts, language-specific evidence, contextual setup, license checks and no unsolicited paid fallback. |
| Sources & Library | `specs/sources-library.md`: authorized Douyin/browser session plus local intake; reference/copy/relink; identities, outputs and dependency-aware deletion. | Real source tests separate from local file lifecycle tests; no complete-channel promise. |
| Channels & Shopee | `specs/channels-affiliate.md` and AU-RT01–05: account types, manual labels, configured API publishing, shared posts/schedule and reverse usage. | Mock contract tests then authorized live tests; selected post/channel/link identity survives retry. |
| Full Automation | `specs/automation.md`: flexible triggers, conditional steps/endpoints, rule test and runtime views; reuse INT-07. | Download-only, folder processing, classify-only and full authorized flow; no unused mandatory steps. |
| Plus & services | `specs/execution-policy.md`, Settings; proposed Fastify/PostgreSQL baseline. | Resolve commercial policy before enforcing pricing/expiry; permission, reservation/settlement/reconciliation tests; provider secrets never shipped. |
| Complete Settings/localization/release | Three primary Settings groups, contextual model setup, advanced controls, all screen states in EN/VI; no setup expansion. | Real installers, updates, native dependencies, interrupted installation, secret redaction and locale/data invariants. |
| Later cloud | SC-12, explicit data/permissions/resources; not a desktop prerequisite. | One executor per occurrence; no competing calendars or claim that local-source work runs while the computer is off. |

## 4. Agent handoff rules

Read AGENTS, the referenced spec IDs, contracts and actual test evidence. Keep UI prototype shortcuts labeled. Update status only when its stated gate passes, not because a file exists. Do not approve missing business policy from this plan or turn environment failures into scope cuts. Replace changed contracts and their callers together; do not keep compatibility layers or introduce new engines/languages.

For each follow-on task record touched files, command/output, target environment, acceptance cases, remaining blockers and any consequential owner decision. Retain historical failed checks alongside the corrected run when they explain a test/design change.

## 5. Historical 0.2 evidence

[Integration 0.2 results](research/integration-0.2/RESULTS.md): 22 Node and 19 Python tests passed; one real pysubs2 test skipped. Preserve historical v0.1 records. Public render IDs precede IPC submission, terminal results cannot be reactivated by a late acknowledgement, and registered-file range responses are unit/integration tested. Full UI, OCR/LaMa, durable scheduler, remote CI and signed installers remain unpassed gates.

## 6. Historical 0.3 evidence and former next action

See [results](research/integration-0.3/RESULTS.md). The common coordinator now handles preparation/render cancellation, and empty-cue rendering avoids an unnecessary subtitle dependency. Project serialization/atomic replacement and source-file protection have executable filesystem tests. Core tests use the available TypeScript 5.8.3 fallback, not the declared 7.0.2 toolchain. No Rust, pricing-policy change, new scheduler or UI scope reduction.

INT-01 and executable formatting/hooks remain blocked by dependency download. INT-03/04 now have a runnable Electron test entry and EN/VI scenarios, **not a passed UI gate**. Execute `npm ci` after committing a real network-resolved lock, run Biome/Ruff and the full build, then `npm run test:e2e`; fix component/API/asset-loading failures without masking the tests or cutting tools. INT-07 durable Automation remains pending rather than being inferred from in-process cancellation tests.

## 7. Historical integration 0.4 handoff

See [results](research/integration-0.4/RESULTS.md) and [batch behavior](specs/batch-jobs.md). Owner-side setup/testing is deferred, not waived. New source and bounded local checks continue without a registry install attempt. Keep the actual `node:sqlite`/Electron runtime, Biome/Ruff, full typecheck, E2E and Windows/macOS output-filesystem gates open until exercised. No Rust, new paid behavior, dependency-version claim or automatic background service.


## Historical handoff: integration 0.5

Read [current evidence](research/integration-0.5/RESULTS.md) and the [local UI skill](.agents/skills/reupmatic-ui-design/SKILL.md). Run installed `test:watcher` and `test:e2e` separately after bootstrap; the broad initial local test glob also attempted the missing Chokidar lane and that failure is preserved. No successful full build, lint, hooks, screenshot review or packaging claim. Local schema/core/native checks do not waive target-runtime tests.


## Integration 0.8 continuation

`specs/local-processing.md` defines the implemented local recipe subset of INT-06/07.
Editor, manual batch and folders share contracts and the existing render/worker
lifecycle. Full-duration processing, immutable model pins, project v2 and common
Astryx controls are implemented; source/native checks are recorded separately in
`research/integration-0.8/RESULTS.md`. This does not close INT-01, true-model quality,
production authorization, general workflow scheduling or any publishing acceptance.


## Current handoff: integration 0.9

Read `SYSTEM_MAP.md`, `docs/planning/scope-coverage.md` and the 0.9 RESULTS report.
The 22-module map preserves five task areas, three execution modes, 76 feature
slices and 24 end-to-end flows against SC-01–SC-14. Reserved markers do not satisfy
acceptance criteria. Routing remains an Automation responsibility; channel/link/
post records are shared rather than duplicated by each screen.

0.9 adds local catalog/taxonomy, reusable processing profiles, saved workflows/
run history, channels/affiliate and export-backed post drafts. Workflow execution
uses the existing journal and remains developer-gated; publishing is not connected.
Greenfield rules replace earlier project-compatibility planning: update one current
contract and all callers together; preserve data by rejecting unsupported formats.
`docs/planning/implementation-sequence.md` orders the remaining scope by dependency.
