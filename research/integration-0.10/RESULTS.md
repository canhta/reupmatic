# Integration 0.10.0 — implementation and evidence

Baseline: the supplied `reupmatic-v0.9.zip`. Handoff: source-only
`reupmatic-v0.10.zip`, version **0.10.0**. The next release is 0.11.0.
This does not represent full product completion or an installed Electron build.

## Implemented vertical slices

| Scope/flow | Implementation |
| --- | --- |
| SC-03; FLOW-01/03/13/22 | Current editing contract, Astryx framing/color/speed/audio/trim controls, shared profile/project/queue persistence, native sample/full rendering and source/output clock mapping. Editing-only work needs no model. |
| SC-02/03; FLOW-21 | Whole-document undo/redo, current project snapshot, SQLite recovery store, optimistic revision/source guards, explicit recover-as-copy/discard and close-time flush/failure choice. |
| SC-05; FLOW-22 | Display-text literal/regex preview/apply/undo with a two-second worker budget, bulk timing shifts, source-timed and edited-output SRT actions. |
| SC-13; FLOW-06 | Whole-source OCR independent of rendering/removal/Editor application, bounded shared scanner, adjacent cue merging, retained raw chunk evidence and direct SRT export. |

For exact behavior and limitations see `docs/development/local-editing.md` and
`docs/development/local-recovery.md`. Scope authority and all 76 feature groups,
24 flows, five task areas and three independent modes remain mapped. Implemented
parts are still marked partial where their broader feature is not complete.

## Recorded results

| Check | Result | Evidence |
| --- | --- | --- |
| Core compilation and Node business tests | 145 passed | `core-suite.tap` |
| Scope, structure, architecture, UI policy and tooling guards | 35 passed | `guard-suite.tap` |
| TypeScript → Python/FFmpeg integration | 8 passed | `bridge-suite.tap` |
| Python discovery suite | 82 run: 81 passed, 1 skipped | `python-suite.txt` |
| Editing-specific native media | 4 passed, included above | `editing-native.txt` |
| Full-source OCR native flow | 2 passed, included above; controlled OCR SDK | `ocr-extraction-native.txt` |
| Syntax-only TS/TSX/CTS transpilation | 147 source files, no syntax diagnostics | `typescript-syntax.txt` |
| Full app dependency-aware type check | Not passed: Electron/chokidar dependencies missing | `full-typecheck.txt` |
| Dependency registry connection | Failed DNS resolution | `registry-connectivity.txt` |
| Ruff availability | Not installed | `ruff-availability.txt` |

These groups are not all additive: focused test logs repeat cases in the full
suites. The combined Node core/guard count is **180**, plus 8 native bridge cases.
The Python skip is the pre-existing subtitle import/export/ASS case requiring
`pysubs2`. The full Python suite was run without a tool-imposed interruption and
its final summary is retained; an earlier interrupted attempt is not counted.

Native editing uses actual FFmpeg, not an AI SDK double: trim/speed duration,
portrait crop/framing, mute, gain ratio, sample/trim intersection, source-timed
caption burning, empty/invalid range rejection, cache identity and unchanged
originals. Existing bridge suites exercise the saved Library/workflow/batch path.
OCR extraction uses actual decoding, protocol, chunk processing and filesystem
publication, but **controlled recognition output**. The 121-second fixture crosses
the 120-second sample boundary, preserves raw evidence and publishes no video.
It does not establish real RapidOCR accuracy, model compatibility or LaMa quality.

The first editing contract red/green logs are retained. They are not a claim that
every added feature or UI action has a complete TDD/E2E evidence chain.

## Environment and verification boundary

Available tools: Node 22.16.0, TypeScript 5.8.3, Python 3.13.5 and FFmpeg 7.1.5.
Core compilation uses a temporary external `@types/node` 25.1.0 link. The declared
project target remains Node 24 and the pinned project dependency versions; this
fallback toolchain is not certification of that target. The link, dependencies
and generated build directories are excluded from the source ZIP.

No installed React/Astryx/Electron build, Vite bundle, actual UI screenshot,
keyboard/IME/accessibility session, real OCR/LaMa model inference, target-OS
installer or GPU benchmark is reported as passed. Syntax transpilation and import
policy checks do not validate component props or visual quality. Dependencies
could not be installed because the registry did not resolve. No lockfile or
production bundle is fabricated to hide that limitation.

Recovery store/CAS/history behavior is tested; the actual renderer close/crash
matrix remains owner verification. Regex worker isolation/timeout is implemented,
but browser responsiveness/accessibility still needs the real UI. OCR extraction
does not require pysubs2; its SRT save action does require that declared package.

## Structure, retention and packaging

One root `AGENTS.md` contains the engineering rules and current entry. Code stays
within business-owned modules and runtime boundaries. No compatibility reader,
legacy shim, automatic migration, second job queue or primitive UI library is
added. All 96 baseline `.gitkeep` markers remain; six boundaries now contain source
and are promoted in the map, leaving 90 declared reserved boundaries. All 12
original public assets were compared byte-for-byte with the supplied baseline.

The largest implementation/source file under app/worker is 295 lines; main entry
points remain under their guards. `source-sizes.txt` records the full size list.
Canonical processing/editing contracts and embedded admission schemas are covered
by anti-drift tests. Retained-path checks now protect the new source files too.

The source packager refuses non-increasing versions or overwrites, validates ZIP
integrity, excludes dependencies/models/fonts/runtime artifacts and writes a
SHA-256 manifest to `RELEASE.json`. Final readback checks are performed on the
completed delivery archive; archive hashes cannot be embedded in themselves.
Earlier delivery ZIPs are retained unchanged.

## Explicit remaining implementation

Still missing, not merely “awaiting verification”: multi-clip composition and
split/join/reorder; replacement audio/voiceover; complete subtitle styles and
independent text layers; STT/translation/TTS; richer Library project/export/audio
views; download/classification connectors; flexible production triggers/scheduler,
OAuth/upload/publication reconciliation; resource/model downloads and cleanup;
account/credits policy and services; cloud execution; native installers/update
infrastructure. The current detailed gaps are in `docs/planning/scope-coverage.md`.

Local planned posts remain plans, not publication. Developer-gated workflows and
folder intake remain gated. Inpainting is still a 960-pixel-long-edge / 24 fps
working-resolution flow; output scaling cannot restore native detail.

The owner-requested ntfy POST is attempted only after the final ZIP is ready.
Its transport result is reported separately, not assumed successful here.
