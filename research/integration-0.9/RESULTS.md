# Integration 0.9.0 — results and handoff boundaries

Recorded 2026-09-15. Baseline: the supplied `reupmatic-v0.8.zip`, not the
inconsistent descriptions of earlier handoffs. Artifact: `reupmatic-v0.9.zip`.
This is a source release. The next minor handoff is 0.10.0; existing archives
are preserved. Runtime support for old development data is explicitly removed.

## Delivered vertical slices

- Shared revisioned SQLite catalog for labels, local destinations, affiliate
  links, draft posts, processing profiles, workflow definitions and run receipts.
  Stale edits fail rather than overwrite a newer revision.
- Channels/Affiliate/Post workspaces with search, label assignment, archive,
  reverse post usage, concrete Library-export selection and pinned choices.
  YouTube/Facebook Page records remain manually configured and unconnected;
  Shopee links are manually entered. No OAuth permission, upload, publication,
  traffic or revenue is fabricated.
- Shared planned-time editing stores an instant and timezone. Nonexistent local
  times fail; repeated hours require an explicit choice. Existing precise times
  are retained when unchanged. This is not a scheduler.
- Processing-profile save/edit/archive/import/export and explicit application in
  Editor, batch and workflow forms. Profiles cover the implemented processing
  subset and reject per-video manual masks. They are not complete video/audio/
  speech presets for modules not implemented yet.
- Saved Library-based workflows, immutable prepared inputs/model fingerprints,
  existing BatchQueue admission and run history. A crash between queue commit
  and catalog receipt does not create a second job. Execution remains gated by
  `REUPMATIC_DEV_AUTOMATION=1`; no production triggers or entitlement claims.
- Shared labels integrated with Library/channel/link records. Library removal
  checks post and workflow references; catalog removal never deletes media.
- One root `AGENTS.md` with the owner's structure, meaningful abstraction,
  Astryx, scope preservation, greenfield, versioning and completion-ping rules.
  No nested or differently cased duplicate instruction file.
- One current project v2 schema, optional processing, updated producers/consumers/
  schemas/fixtures and rejection of other formats. Removed compatibility
  re-exports. All four SQLite stores share current-schema opening and atomic
  fresh initialization; unsupported/incomplete stores fail without mutation.
- The developer batch CLI now uses the existing durable SQLite queue and requires
  an isolated new workspace. It no longer keeps a separate direct render loop.
- The channel reset handler now uses the existing draft/discard lifecycle rather
  than an undefined pre-refactor variable and native confirm.

UI source uses deliberate Astryx task compositions. The new forms, tabs and
catalog lifecycle are implemented in source; their installed Electron/visual
behavior is **not** certified by core tests. See the task-to-component rationale
in `docs/ui/astryx-component-map.md` and `docs/development/local-workspaces.md`.

## Scope and source preservation

`BUSINESS_SCOPE.md` and the numbered decisions remain authoritative. The generated
root `SYSTEM_MAP.md` and `docs/planning/scope-coverage.md` trace all 14 scope groups,
five main areas and three operational modes across 22 modules, 76 feature slices
and 24 flows. The machine maps distinguish partial implementation from planned
work; they are not a proof of complete requirements coverage.

There are 96 `.gitkeep` boundaries for unfinished source/service/delivery modules.
Scaffolding only creates missing markers, refuses unsafe paths/symlinks and does
not truncate existing source. Structure checks, retained-path checks and the
packager preserve these markers. A marker is not an implemented feature or an
installer. Routing remains owned by Automation; posts/plans use the shared model.
Download-only, OCR-only and classification-only remain independent endpoints in
the plan instead of being forced through rendering or publishing.

All 12 supplied public assets were compared byte-for-byte with the original
`public.zip` before packaging. Longest handwritten implementation file in app/
worker is 286 lines (`app/ui/i18n.ts`); the source guard limit remains 450.

## Actual environment

The available execution environment was Linux, Node **22.16.0**, TypeScript
**5.8.3**, Python **3.13.5** and FFmpeg **7.1.5**. These are not the project's
pinned target runtime/tool versions. Core compilation used the environment's
available Node type declarations; the local dependency symlink, node_modules
and generated dist directories are excluded from the handoff.

No substitute Electron/React/Astryx declaration stubs were used to fabricate an
application build pass. A resolved dependency lockfile was not fabricated.

## Completed final checks

| Command / group | Result | Evidence |
| --- | --- | --- |
| `npm run test:core` | 129 passed, no failures/skips; core compiled with the available compiler | `node-core-final.tap` |
| Structure, scope traceability, architecture, UI policy and tooling Node tests | 35 passed, no failures/skips | `source-guards-final.tap` |
| `npm run test:bridge` | 8 passed, actual TypeScript/Python/FFmpeg and SQLite | `native-bridge-final.tap` |
| Python contracts, models, processing units, vision units/contracts and packaging | 48 passed | `python-core-final.txt` |
| Python full-duration processing native suite | 7 passed, actual FFmpeg and controlled AI adapters | `python-processing-native-final.txt` |
| Python vision/native worker suites | 20 passed, 1 skipped because `pysubs2` is not installed | `python-media-native-final.txt` |
| `npm run structure:check` | 22 modules / 96 reserved boundaries | `structure-scope-final.txt` |
| `npm run scope:check` | 14 scopes / 5 areas / 76 feature slices / 24 flows | `structure-scope-final.txt` |

Distinct final totals: **164 non-native Node checks + 8 bridge checks**, and
**75 passed Python tests + 1 skipped**. The 11 packaging tests are included in
the 48-test Python group, not counted again. The smaller red/green, first-pass
and CLI-specific logs overlap these totals.

The full Python discovery command exceeded the 45-second execution limit
(`python-final.txt` is incomplete). All nine discovery test modules were then
rerun to completion in the three groups above. Earlier `python-tests.txt` is also
an interrupted log, not a successful run. Initial failing regression logs are
retained as implementation evidence; the final logs supersede them.

Native bridge coverage includes the current developer CLI's durable queue and
workspace-reuse refusal, and the saved-workflow -> shared queue -> FFmpeg ->
Library export -> local destination draft path. It does not exercise a remote
platform or a real OCR/LaMa model. Current-schema tests assert byte-identical
rejected database files and retained owner data.

## Blocked or not claimed

- `npm run build` was attempted and failed on unavailable Electron/chokidar and
  related dependency types. See `full-build.txt`. Registry access failed DNS
  resolution (`registry-connectivity.txt`). Full build/typecheck/installed
  Astryx API compatibility, Biome/Ruff, Electron E2E, keyboard/IME/accessibility,
  EN/VI screenshots, production watcher behavior and target OS packages are not
  passed. The documented target toolchain still needs execution.
- `ui-symbol-check.txt` is only a targeted undefined-symbol diagnostic: zero
  unresolved local names in that check, with 1,102 other diagnostics under
  missing dependencies. It is not a complete typecheck, render or UI test pass.
- Native vision/processing tests run actual decoding/encoding with controlled
  SDK/model adapters. They do not approve real OCR accuracy, LaMa quality,
  model licenses, GPU behavior or throughput. One subtitle-library round-trip
  remains skipped because its actual serializer is absent.
- Source packaging is not a Windows/macOS installer, signed distribution or
  automatic updater. No models, fonts, dependency trees, media datasets or
  binaries are included.

## Remaining product work, not merely verification

See every feature/flow acceptance list in `docs/planning/scope-coverage.md` and the
ordered vertical slices in `docs/planning/implementation-sequence.md`. Important
unimplemented work includes complete video/audio/multi-clip editing, autosave and
full Library asset views, subtitle text rules/layers and standalone OCR/SRT,
STT/translation/TTS and full-duration dubbing, authorized downloads and content
classification, flexible workflow endpoints/routing/triggers/scheduler, OAuth/
upload/publishing reconciliation, model download/resource/cache management,
account/Plus/credits policy and target-platform packaging. Cloud is a reserved
later extension, not an implicit requirement for local operations.

`OWNER_CHECKS.md` lists the current source release's manual acceptance paths.
The handoff's completion ping is sent externally only after the archive is built;
no tests, application startup or packaging hooks publish to the owner's topic.
