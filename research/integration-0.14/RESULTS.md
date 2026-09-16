# Reupmatic 0.14.0 — implementation and verification

Date: 2026-09-16. Baseline: supplied reupmatic-v0.13.zip (0.13.0).
Kind: source-only sequential handoff, not an installer or production/model approval.
Current scope: SC-04-F02/05/06 and SC-05-F04/05, direct Editor / SCR-02;
acceptance trace: specs/local-translation.md (LT-01–09).

## Implemented

A configured local bilingual CTranslate2/SentencePiece CPU adapter now accepts
captured transcript or displayed text, explicit source/target language, model
identity and bounded ordered literal target replacements. Native manifest setup,
per-job file hashes and a cancellable inference child reuse the existing worker
queue. There is no downloader, network fallback, second executor or automatic render.

Results are separate session drafts. The Editor compares source, existing,
generated and final text by cue ID, including final timings, across 25-row pages.
Default keep-existing preserves every existing cue, including manual timing and
extra IDs, adding only missing ones. Whole-layer replacement is an explicit policy
with a separate confirmation when prior content exists. Only translated text is
applied; displayed/spoken layers never have their content replaced automatically.

A changed source requires new inference. Changed targets can be re-reviewed.
Exact preview/document checks prevent stale application. Applied translations
persist languages/model/runtime/rules/request/policy provenance, invalidate
dependent copies without rewriting words, and participate in whole-document
undo/redo, actual project save/reopen, SQLite recovery and common composition-clock
mapping. The existing keep-my-edits source acknowledgement now understands
translation provenance. STT shares atomic child-result publication with translation.

## Current formats and limits

Project **5** and text-layer **2** are the only current readers. Previous projects,
including schema 4 from 0.13, and prior text-layer documents are explicitly rejected
without migration/reset/downgrade/file rewrite. Library schema stays 2; recovery
SQLite table schema stays 1. All original source/media protection is retained.

One explicitly declared EN/VI/ZH direction per compatible trusted local bundle,
not universal multilingual model support. Per-cue translation retains times, not
semantic alignment or fitted speech. Up to 500 nonblank cues, 4,000 UTF-16 units/cue,
100,000 source UTF-8 bytes, 511,000 parameter JSON bytes / 512,000 public-envelope
bytes. Source tokens <=512, decoding limit 512, explicit EOS required. Result
<=1,000,000 bytes and 10,000 UTF-16 units/cue. Rules <=50, each field <=256 units.
Empty, malformed, mismatched, partial or truncated results fail as a whole. Full
compatibility and operating instructions: docs/development/local-translation.md.

## Environment and dependency honesty

Observed Linux tools: Node 22.16.0, npm 10.9.2, TypeScript 5.8.3, Python 3.13.5,
FFmpeg/ffprobe 7.1.5. Package targets remain Node 24 and TypeScript 7.0.2; those
exact targets were not installed/tested. To run actual core compilation, excluded
node_modules links point at the preinstalled real TypeScript and ts-node's real
@types/node 25.1.0. These are not fake declarations, not a resolved target npm tree,
and are not packaged. Initial missing-node-types evidence is retained separately.

Optional translation requirement pins CTranslate2 4.6.0 and SentencePiece 0.2.1
from reviewed primary APIs. They are setup targets, not latest-release claims,
installed runtime evidence, transitive locks or model/license approval. No model,
SDK, owner media, secret or font binary is bundled. No real translation quality
claim is made. Native translation tests use controlled SDK/model fixtures and real
worker/subprocess/cancellation/queue/file operations. STT/vision fixture limits
from earlier versions still apply to those native tests.

## Final verification lanes

| Command / lane | Result | Evidence |
| --- | --- | --- |
| npm run test:core | 206 passed, no failures | core.tap; full-test.txt |
| npm run test:bridge | 9 passed, no failures | bridge.tap; full-test.txt |
| Structure, scope, architecture, UI-source and tooling tests | 40 passed, no failures | guards.tap; full-test.txt |
| npm run test:python | 148 run: 145 passed, 3 explicitly skipped, no failures | python.txt; full-test.txt |
| structure:check / scope:check / contracts:check | Passed | structure-scope-contracts.txt; full-test.txt |
| Full npm test | Passed, exit 0; final Python lane 148 run in 108.830 seconds | full-test.txt; full-test-exit.txt |
| App syntax/transpile and relative-import existence | 198 files / 646 relative imports, no diagnostics | source-syntax.json |

**400 passed and 3 skipped across the four final test groups.** The combined
`npm test` repeats those groups; do not add duplicate executions to the count.
Syntax/transpile/import checks are not dependency-resolved UI typechecks.

The three skips are the existing pysubs2-dependent subtitle parsing/import cases;
no substitute parser or deleted test hides the missing dependency. Exact skip
messages are in python.txt. Translation itself does not need pysubs2.

New evidence includes source/result correlation, manual preservation/defaults,
stale/tampered review rejection, explicit replacement, cycles, language guards,
cancel/late result, strict progress forwarding, complete history, actual filesystem /
SQLite roundtrip, source protection and presentation-independent displayed-source
translation. Native fixtures test bundle changes during inference, token and EOS
limits, missing output, network denial, cancellation/child reaping, cleanup and
queue reuse. JSON schemas and runtime limits are checked independently.

Earlier red logs are retained: missing public translation modules/worker imports
before implementation. An initial combined run failed on the new displayed-source
test's incomplete style fixture; it was corrected to use the actual existing
SubtitleStyle contract, not by relaxing production validation. The failed run is
full-test-initial.txt; final evidence supersedes it. Other intermediate failures
were old schema assertions/fixture expectations updated with the current schema.
An early broad Python tool invocation timed out before completion; the full final
Python and combined runs complete separately, rather than counting that partial
attempt as passing.

## Blocked or not-run gates

- `npm run typecheck` and `npm run build`: blocked by unresolved Electron and
  other runtime dependencies. `tsc -p tsconfig.ui.json --noEmit`: missing vite/client.
  These gates did not pass. Logs: typecheck.txt, ui-typecheck.txt, build.txt.
- `npm run check`: Biome missing. `npm run check:python`: Ruff missing. Neither
  formatting nor full lint approval is claimed. Logs: biome.txt, ruff.txt.
- Installed Astryx discovery: CLI package missing; three command errors recorded
  in astryx-discovery.txt. Pinned upstream component signatures were inspected,
  but installed-package types and rendered output were not verified.
- Loaded Electron, full E2E, watcher lane, EN/VI visual/responsive screenshots,
  keyboard/focus/screen-reader/IME, real model accuracy/long-duration behavior,
  RAM/CPU acceptance, native target-OS installers/signing/licenses: NOT RUN.

## Skills, paths and source packaging

Both local skills are activated by root AGENTS.md and reviewed in SKILLS_REVIEW.md.
The 839 supplied 0.13 source paths remain present. All 12 original public files,
5 skill/reference files and 96 original .gitkeep markers are byte-for-byte intact.
The worker translation boundary is promoted to implemented without deleting its
marker; the current map has 22 modules / 84 reserved entries. All 14 scope groups,
5 screens, 3 independent modes, 76 features and 24 flows remain mapped. Detailed
hash/path checks: source-retention.json. Old release ZIPs are not overwritten.

The existing packager enforces synchronized metadata/maps/contracts and produces
one reupmatic/ root, embedded RELEASE.json source SHA-256 inventory and ZIP CRC
checks. Source counts/ZIP hash and final verification are recorded in the separate
handoff report beside the ZIP. Excluded: node_modules, compiled output, caches,
credentials, owner media, weights, fonts and nested archives. Completion notification
is attempted only after packaging; its actual outcome is in that handoff report.

## Remaining implementation

Next archive **0.15**: explicit local synthesis from the independent spoken layer,
reviewable audio artifacts and stale/cancel/provenance protection; then separately
verified timing/alignment and full-duration mixing. Cross-cue translation context,
model terminology, reusable rules, durable drafts, batch/Automation speech,
Downloads/classification, triggers/scheduling, connected publishing, resource/model
lifecycle, accounts/commercial decisions and owner release gates remain visible in
scope maps and the implementation sequence. The full system is not finalized.
