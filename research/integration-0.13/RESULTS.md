# Reupmatic 0.13.0 — integration results

Date: 2026-09-16. Input: supplied `reupmatic-v0.12.zip`. Current application
version: **0.13.0**. Handoff: `reupmatic-v0.13.zip`. This is source integration,
not an installed desktop release, real-model certification or full-system acceptance.
Historical source/evidence and the supplied ZIPs are retained.

## Progress inspected and delivered slice

Root instructions, both local skills and references, current scope/specifications,
architecture/coverage maps, implementation order and prior verification were
inspected. The 0.12 foundation includes hard-cut composition, cue editing, native
rendering, Library/assets, soundtrack, local queue/folders and bounded workflows.
The next planned slice was independent text and timed local speech recognition.
The full scope is still not finalized.

0.13 delivers four independent text layers with language, origin/provenance,
manual-edit state, copy dependencies and stale metadata. The same cue editor and
timeline target the selected layer; displayed cues remain the sole video-caption
track. Copy is previewed and revision/token checked. An explicit source review
can preserve corrected text while refreshing its source reference; descendants
still require their own review. Style-only edits do not invalidate spoken text.
Whole-document undo/redo, composition time mapping, project schema 4 and existing
SQLite recovery preserve all applied layers. SRT import and SRT/ASS export target
the selected layer, without inferring translation or synthesized voice.

The new local recognition adapter uses a native-selected, hashed local manifest,
explicit source language and CPU/int8 faster-whisper integration through the
existing worker queue. It verifies source/model identity, extracts bounded mono
16 kHz PCM with original delayed-audio timing, executes a cancellable child and
returns source-clock segments with runtime provenance. No download, auto-language,
cloud/paid fallback, TTS or word alignment is introduced. Model setup is explicit,
atomic and cancellable before commit; actual saved status is refreshed after races.

A successful STT response is a separate session draft. Compare/review before
explicitly replacing the entire transcript, including material outside a sample.
Unrelated layers are not rewritten; copied dependents can become stale. Empty
results cannot wipe the transcript. Unapplied drafts are not durable autosaves.
The guide and LS-AC01–10 specify limits, setup and failure semantics.

## Final executable suites

These are separate, non-overlapping suites. Focused/red/earlier runs are development
evidence and are not added again. The combined `npm test` entry was not run as
one process; its constituent suites and checks were executed separately.

| Command | Result | Evidence in `logs/` |
| --- | --- | --- |
| `npm run test:core` | 189 passed; 0 failures/skips, including actual core TypeScript compilation | `core-final.tap` |
| `npm run test:bridge` | 9 passed; 0 failures/skips; real Python/FFmpeg and existing local workflows | `bridge-final.tap` |
| Combined structure/scope-test/architecture/UI-source/tooling Node tests | 35 passed; 0 failures/skips; static/source guards, not visual approval | `guards-final.tap` |
| `npm run test:python` | 127 run: 124 passed, 3 skipped, 0 failures | `python-final.txt` |
| `npm run structure:check` | Passed: 22 modules, 85 remaining reserved declarations | `source-checks-final.txt` |
| `npm run scope:check` | Passed: 14 scope groups, 5 screens, 22 modules, 76 feature slices, 24 flows | `source-checks-final.txt` |
| `npm run contracts:check` | Passed: canonical/generated current contracts synchronized | `source-checks-final.txt` |

**Total: 357 passed, 3 skipped, zero failures across the four final test suites.**
This does not count blocked tooling as passed. The three Python skips are explicitly
pysubs2-dependent subtitle serialization/round-trip checks; native FFmpeg subtitle
burning runs. Python completed in approximately 101 seconds in this environment.

### Native recognition evidence and limits

The 22 new Python cases cover local manifest/runtime discovery, hash/identity,
configuration cancellation, segment bounds/correlation, strict schemas and native
recognition plumbing. Seven native cases use real FFmpeg/ffprobe, original media,
actual worker NDJSON and actual inference subprocesses with temporary, explicitly
controlled SDK/weight doubles. They test source audio starting one second late,
exact sample/full PCM correspondence, Unicode source-clock results, empty output,
English-only refusal, no-audio refusal, changed weights, audit-denied network,
child cancellation/reaping, cleanup and the following queued job completing.

These are not real faster-whisper/CTranslate2 quality, silence/hallucination,
model licensing, throughput, memory or target-wheel acceptance. No real STT model
was installed or executed. Existing OCR/inpainting tests also retain their clearly
labelled SDK-double limitations. Actual source fixture bytes are protected.

### Behavior-first and review evidence

Initial `text-layers-red.tap`, `speech-red.tap` and `speech-python-red.txt` are
retained with subsequent focused green runs. Review fixed a Node transport import
being pulled into the UI by speech validation; the shared error identity now has
actual multi-feature callers and browser-safe dependencies. Another red case
caught reviewed-keep-edits unnecessarily allocating a rejected oversized copy;
shared preview validation now preserves the small edited target independently.
A red request case catches array coercion in the language field; exact string
validation now rejects it. Final core tests include both passing regressions.

Old `*-first` / intermediate logs can contain superseded failures. Earlier full
Python attempts were interrupted by command timeouts; only `python-final.txt`
contains the completed 127-test run and counts above. No interrupted run is
claimed as successful. All full suites above are the final recorded results.

### Supplemental static checks

`typescript-syntax-imports.txt`: genuine TypeScript 5.8.3 transpilation/syntax of
186 application implementation files, zero syntax errors; AST traversal of 122
renderer-reachable local value-import files, zero Node/Electron import violations.
The core regression also traverses the runtime imports of speech/text/composition
validators. These are not dependency-resolved UI typing or executed interaction.
No fake SDK/React/Electron declaration files or new formatter were introduced.

## Environment and blocked gates

`environment.txt` records Linux, Node 22.16.0, npm 10.9.2, TypeScript 5.8.3,
Python 3.13.5, FFmpeg 7.1.5, jsonschema 4.26.0, NumPy 2.3.5 and OpenCV 4.13.0.92.
The repository declares Node 24, Python 3.14 and TypeScript 7.0.2; this verification
host is not that target environment. Core compilation uses genuine available Node
typings via a local symlink excluded from the archive; dependencies were not
installed or replaced with invented declarations.

| Gate actually attempted | Status and evidence |
| --- | --- |
| Three installed Astryx discovery commands | Failed MODULE_NOT_FOUND; `astryx-discovery.txt`. Existing source-reviewed APIs reused; packageVerified remains false. |
| `npm run typecheck` | Exit 2, missing Electron/chokidar declarations plus dependent inference errors; `typecheck-final.txt`. |
| Direct UI TypeScript check | Exit 2, missing `vite/client`; `ui-typecheck-final.txt`. |
| `npm run build` | Exit 2 at missing installed native/UI dependencies; `build-final.txt`. No build approval. |
| `npm run check` | Exit 127, Biome executable absent; `biome-final.txt`. |
| `npm run check:python` | Exit 1, Ruff module absent; `ruff-final.txt`. |
| Real recognition runtime/model | faster_whisper, ctranslate2, tokenizers and av absent; `environment.txt`. Only controlled test doubles run. |
| Loaded UI/full E2E/OS acceptance | Not run: Electron screenshots, keyboard/focus, Vietnamese IME, responsive layout, live Chokidar, installers, resource/long-run quality. |

The optional `worker/requirements-speech.txt` targets the reviewed faster-whisper
1.2.1 API, not a latest-release claim, transitive lock, installed environment or
model license approval. Primary source references and explicit setup steps are
in `docs/development/local-speech.md`. No model/registry network action is started
by the app. Python audit restrictions are defense in depth, not a native OS sandbox.

## Skills, preservation and packaging

`SKILLS_REVIEW.md` separates engineering standards, bounded specification coverage,
component rationale and unexecuted visual/interaction acceptance. Both project
skills remain active via root AGENTS; all five skill/reference files are unchanged.
`source-retention.json` confirms all **769** baseline source paths remain, all
**12** public assets, **5** skill/reference files and **96** marker files are
byte-identical. The current retained-path guard now protects the whole 0.12 source
inventory; reducing reserved map entries by implementing a boundary does not remove
its marker. Historical 0.11/0.12 archives/evidence are not overwritten.

The existing source packager checks versions, current evidence, scope/contract
synchronization and path preservation, produces one `reupmatic/` root and generates
per-file SHA-256 inventory in RELEASE.json. Dependencies, build output, caches,
models, font binaries, secrets, user media and nested archives are excluded. Final
archive CRC/file hash/retention verification is in the standalone handoff report;
the archive's own hash cannot be embedded into itself.

## Remaining work and next archive

Current project schema is **4**, Library schema remains **2**, recovery table
layout remains **1**; old embedded project versions are still rejected explicitly.
There is no automatic migration or reset. Original media and historical source
archives remain separate from incompatible development project data.

The next sequential source archive is **0.14**: translation preview/apply using the
independent source/translated layers, followed by separately verified spoken-text
synthesis and timing/alignment. Keep composition/batch speech, durable draft
recovery, full Library derivation/deletion, video/audio layers, authorized online
Downloads, classification, flexible Automation triggers/routing/schedules, connected
publishing, resource/model lifecycle and account/commercial policy gates visible.
`docs/planning/implementation-sequence.md` and the complete scope/flow maps record
remaining work; this is an implementation order, not autonomous future execution
or a claim that the whole system is finished.
