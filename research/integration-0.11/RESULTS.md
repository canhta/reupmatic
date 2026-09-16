# Source delivery 0.11.0 — recorded evidence

Baseline: supplied `reupmatic-v0.10.zip` (0.10.0). Current archive:
`reupmatic-v0.11.zip`; next minor handoff: 0.12.0. Existing archives remain intact.
Owner handles installer production and full application E2E. Neither is a blocker
for continued scoped feature implementation.

## Delivered slice and code ownership

Library exact assets: `app/core/library/library-assets.ts`, `library-store.ts`,
host `features/library/assets/ipc.ts`, UI `features/library/assets/`. Source assets
are separate from project/export/subtitle/audio browsing. Native attachment,
content/kind/search pagination, availability checks and exact-file preview/open
retain content identity; old links do not follow new bytes at the same path.
Batch Library indexing awaits the actual output hash/registration before marking
completion indexed; failed indexing remains eligible for retry. Metadata-link
failure never deletes a successfully saved file.

Soundtrack: `app/core/editing/soundtrack.ts`, host Editor audio grants, UI
`editor/audio-tools/`, `worker/media/audio/`. One local music clip supports trim,
output-clock placement, replacement or mixing original sound, gain and fades.
It goes through existing sample/full coordinator/worker encoding and cache checks,
not another engine. Applied track settings survive undo, project and recovery;
opening requires native selection of matching audio instead of trusting saved paths.
No music enters reusable profiles or the source-only batch admission by accident.

Appearance/export: core subtitle style, shared UI `editor/subtitle-styles/` and
`worker/subtitles/style.py`/`document.py`. Global or one-cue full appearance is
staged then explicitly applied/inherited. Font/size/colors/outline/shadow/box,
position/margins/spacing and bold/italic produce ASS through pysubs2; current source
or output timing can be exported as independent SRT/ASS. SRT is text/time only.
Processing profiles reuse global appearance; edits and cue overrides are not merged
into speech/translation layers that do not yet exist.

Current Library schema is 2; current project schema is 2. Unsupported stores fail
without compatibility readers, migration or automatic reset. Canonical schemas
are composed by `scripts/sync-contracts.py`; its check detects embedded drift.

## Commands that completed

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run test:core` | 155 passed | `core-tests.tap` |
| `npm run test:bridge` | 8 passed | `bridge-tests.tap` |
| Node architecture/UI/structure/scope/tooling guards | 35 passed | `guards.tap` |
| Python domain/contracts/packaging/validation group | 54 passed, 2 skipped | `python-domain.txt` |
| Python native editing + soundtrack group | 10 passed | `python-editing-audio.txt` |
| Python native worker group | 14 passed, 1 skipped | `python-worker.txt` |
| Python native processing/OCR/vision group | 15 passed | `python-vision-processing.txt` |
| `npm run scope:generate`, `contracts:check` | completed | generated maps and `test_media_contracts.py` |
| TypeScript syntax/transpilation inspection | 163 source files, no syntax diagnostics | `typescript-syntax.txt` |

Totals: **198 Node cases** including the 8 bridges; **96 distinct Python cases,
93 passed and 3 skipped**. Python discovery was split into four disjoint module
groups to fit the command execution limit. Earlier monolithic attempts were stopped
by the tool and are explicitly retained as `*-incomplete.txt`; they are not counted
as completed runs. Focused logs may overlap the four groups and are not added again.

All three skips require missing **pysubs2**: two new real serialization checks and
one existing worker subtitle round-trip. There is no substitute production parser.
Pure style-to-ASS math uses a small adapter object, not actual serializer behavior.
FFmpeg editing/music tests use real media processes without an AI double, including
silence padding, fixed duration, output-clock placement after trim/speed, mix vs
replace, source mute, fades, cache invalidation and unchanged originals. OCR/LaMa
native tests still substitute recognition/inference SDKs and are not model-quality
evidence. Their fixture's delayed inference now imports its actual timing module.

Initial new-feature red tests are retained in `initial-red.tap`; subsequent green
coverage includes immutable links, repeated registration, same-size/mtime changes,
project ownership, style validation/history and source-authorized audio delegation.

## Environment and owner verification boundary

Available here: Node 22.16.0, TypeScript 5.8.3, Python 3.13.5 and local FFmpeg/ffprobe.
The project keeps its declared Node 24/TypeScript 7/Electron/Astryx versions; those
packages were not installed here. Core compilation uses the available global TS
and Node declarations; no fake package declarations or lockfile were invented.
`host-typecheck.txt` records missing Electron/Chokidar modules and resulting implicit
callback types. It is **not a passing full typecheck**. Transpilation inspection is
syntax only, not UI API validation. No installed Electron/Astryx build, GUI E2E,
real-font screenshot/IME/accessibility acceptance, installer or real-model inference
is claimed. These remain owner execution work, separate from missing features.

Official Astryx catalogue and pinned 0.6.1 component source informed selection;
see `docs/ui/astryx-component-map.md`. Source reading does not replace checking the
installed library. Native audio/video players intentionally use platform controls.

## Scope preserved and still missing

All SC-01–SC-14, five areas, three modes, 22 modules, 76 feature groups and 24 flows
remain in the machine-readable maps. All 96 reserved markers remain; filling one
module does not delete its marker or claim the whole module is complete. Exactly
one root `AGENTS.md` owns rules, including owner responsibility for installers/E2E.

Still unimplemented: multi-clip composition and complete asset derivation/repair,
multitrack/voice generation, independent text layers and STT/translation/TTS,
authorized external download/classification, flexible scheduler/routing endpoints,
OAuth/upload/reconciliation, model/resource lifecycle and accounts/commercial policy.
Advanced typography/multi-cue styling and coordinated multi-artifact export remain.
One soundtrack is not dubbing; local post plans are not actual publication.

The package contains source, current/historical evidence and original public assets,
not dependencies, fonts, model weights or native binaries. Source/package integrity
is recorded separately in `package-integrity.txt` and the generated `RELEASE.json`.
Completion notification is attempted after final packaging and reported with the
handoff; no network success is assumed in this report.
