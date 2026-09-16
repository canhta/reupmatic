# Reupmatic 0.12.0 — integration results

Date: 2026-09-16. Input: owner-supplied `reupmatic-v0.11.zip`. Output:
`reupmatic-v0.12.zip`, canonical `package.json` version `0.12.0`.
This is a source integration, not a packaged desktop release or full-system
acceptance. Historical evidence is retained with its original results.

## Progress inspected and continuation selected

Read root AGENTS, both local skills and the UI reference/adaptation/checklist,
BUSINESS_SCOPE, relevant Editor/Library/screens specifications, source map,
coverage map, implementation sequence and 0.11 evidence. The delivered 0.11
baseline includes single-source editing, soundtrack, subtitle appearance, Library
assets, project/recovery, local batch/folders and bounded workflow/post records.
Its core suite passed 155 tests before this implementation. Those bounded flows
are not proof that Downloads, speech, classification or publishing are complete.

The next documented gap was multi-clip composition. 0.12 adds a vertical hard-cut
slice through Editor UI, typed IPC, core document/history, existing coordinator,
Python media processing, project/recovery and Library association. It does not
introduce a second engine or queue, remove a task area, or reduce remaining scope.
See `docs/development/local-composition.md` for operation, clocks and limits.

## Implemented behavior

- Explicit native start/append; ordered clips with source trim/speed; move, split,
  contiguous same-source/speed join and confirmed removal. Limits: 64 clips,
  100 ms minimum output per clip, 24 hours total, 0.25–4x clip speed. Reject edits
  generating more than 10,000 caption fragments before partially applying them.
- Caption fragments follow retained source content through clip changes while
  preserving text/appearance. Composition, captions and clamped global trim/sample
  bounds form one undoable snapshot. Staged range edits have revision guards.
- EN/VI Astryx controls, read-only composition row in the existing timeline,
  source-clip audition and the existing revision-checked processed sample player.
  Source audition is not continuous final-effects preview; misleading original
  waveform/JASSUB adapters are disabled only in composition mode.
- Fixed even canvas, contain/letterbox, 30 fps shared frame grid and 48 kHz stereo;
  silence for clips without audio. Assemble only the requested trim/sample
  intersection into an internal lossless segment; use existing final encoding,
  global processing, caption timing and final-output-clock music mixing.
- Native grants authorize sources. Worker requests use registered asset IDs,
  hashes and duration pins, not renderer-supplied paths. Verify every source,
  including clips outside a sample, before accepting cache/published output.
  Protect originals, preserve cancellation cleanup and capture render provenance.
- One current project schema, now **3**, carries composition. Project/recovery and
  Library opens require matching native selections for the anchor and all distinct
  additional clip/music dependencies. Cancellation/changed bytes preserve the
  active document. Known Library members can own project links; saves/exports
  attempt links for each distinct member's first known Library content record.

## Executed suites

These rows are separate, non-overlapping suites. Focused runs elsewhere in this
folder are development evidence and must not be added again to these totals.

| Command | Actual result | Evidence |
| --- | --- | --- |
| `npm run test:core` | 171 passed; 0 failed/skipped; includes actual TypeScript core compilation | `core-green.txt` |
| `npm run test:bridge` | 9 passed; 0 failed/skipped; real Python/FFmpeg coordinator and existing local workflows | `bridge-green.txt` |
| `node --test tests/structure.test.mjs tests/scope-traceability.test.mjs tests/architecture.test.mjs tests/ui-library.test.mjs tests/tooling.test.mjs` | 35 passed; 0 failed/skipped; source/static guardrails, not interactive UI | `guards-green.txt` |
| `npm run test:python` | 105 executed: 102 passed, 3 explicitly skipped, 0 failed | `python-green.txt`, `python-green.exit.txt` |
| `npm run structure:check` | Passed: 22 modules and 90 reserved declarations checked | `final-source-checks.txt` |
| `npm run scope:check` | Passed: 14 scope groups, 5 screens, 22 modules, 76 feature slices, 24 flows | `final-source-checks.txt` |
| `npm run contracts:check` | Passed: generated contracts match canonical schemas | `final-source-checks.txt` |

Total across the four test suites: **317 passed, 3 skipped, 0 failed**. This is
not an installed-app/full-E2E pass. The combined `npm test` entry was not itself
run as one process; its listed constituent suites/checks were run separately.

### Native composition evidence

Seven Python native-media cases cover mixed dimensions/frame rates and silence,
clip order, bounded sample assembly across a cut, montage-timed caption burning,
global trim/speed/source audio, replacement-music output offset/fades, fractional
cut durations sharing one frame grid, invalid dependencies and cancellation.
The real coordinator case checks a captured composition despite caller mutation,
actual encoded output/provenance and unchanged source bytes. Existing regression
suites cover single-source render/audio, saved projects, Library, queue/folders,
workflow handoffs and safe saves. These are synthetic media fixtures, not a broad
camera/codec/VFR or target-platform compatibility certification.

The three Python skips are explicit `pysubs2`-dependent serialization/round-trip
checks. Native FFmpeg subtitle-burning checks do run. Controlled OCR/inpainting
SDK tests are not real OCR/model quality or licensing evidence.

### Behavior-first and review fixes

`composition-red.tap` records the initial failing public-interface composition
suite before the implementation existed. `review-red.tap` records two later
failures before fixing bounded caption-fragment expansion and conflicting duration
pins for duplicate source registrations. `core-green.txt` includes their passing
regressions. Early `*-first`/`core-second` logs include superseded development
failures; they are not hidden or presented as final failures/passes.

Review also fixed a bulk-caption shift limit that still used the original anchor
length instead of composition duration, and extracted pure timeline validation so
UI imports do not pull native project filesystem code across the runtime boundary.
The UI source fix is not claimed as a GUI interaction test.

### Additional static verification

`typescript-syntax.txt`: TypeScript 5.8.3 transpilation/syntax review of 175
application source files with no syntax errors. This does not resolve installed
React/Astryx/Electron package types and is not a substitute for `typecheck`.

`ui-import-boundary.txt`: TypeScript AST traversal of UI value imports, 124
reachable local files, zero Node/Electron value-import violations. Existing source
guards separately check direct Astryx use, EN/VI literal messages, ownership,
entry-point responsibilities and file-size limits. No new palette, font binary,
primitive wrapper system or fake production declaration was introduced.

## Actual environment and blocked checks

Observed: Linux, Node **22.16.0**, global TypeScript **5.8.3**, Python **3.13.5**,
FFmpeg/ffprobe **7.1.5**, jsonschema **4.26.0**, NumPy **2.3.5**, OpenCV
**4.13.0.92**. This is not the declared target Node 24 / TypeScript 7 / packaged
Electron environment. Core compilation uses genuine global Node typings made
available locally; neither that symlink nor `node_modules` belongs in the ZIP.

| Gate | Actual status and evidence |
| --- | --- |
| Declared npm dependencies / genuine lock | Unresolved. Registry metadata request failed with `EAI_AGAIN`; `registry-check.txt`. No fabricated lock or substitute UI package was added. |
| Astryx installed CLI/API discovery | All three prescribed CLI commands attempted; missing installed CLI module. `astryx-cli.txt`. Official source/API research informs selection, not an installed-library pass. |
| `npm run typecheck` and separate UI typecheck | Blocked/failed: missing Electron/Chokidar and callback typings, missing `vite/client` for UI. `typecheck.txt`, `ui-typecheck.txt` and exit logs. Do not assume a dependency-resolved typecheck would pass. |
| `npm run build` | Failed at dependency-unresolved host compilation. `build.txt`, `build.exit.txt`. No UI bundle or installer produced. |
| `npm run check` | Blocked: Biome is not installed. `biome.txt`, `biome.exit.txt`. |
| `npm run check:python` | Blocked: Ruff is not installed. `ruff.txt`, `ruff.exit.txt`. |
| Exact Python dependency installation | Attempt could not resolve declared `pysubs2==1.9.0`; `python-deps.txt`. Does not establish that the package is unavailable outside this environment. |
| Loaded Electron, screenshots, keyboard/focus, IME, screen reader, reduced-motion and desktop widths | NOT RUN. Static guards cannot certify these checks. |
| Full application E2E, real watcher dependency, target-OS installers/signing/update/model-license gates | NOT RUN here; owner delivery/acceptance responsibilities remain explicit. |

## Standards/skills and source preservation

`SKILLS_REVIEW.md` separates engineering standards from product/specification
coverage and marks source checks separately from loaded UI checks. Both skills
are repository-local, activated by root AGENTS, not globally installed promises.

`source-retention.json` compares the working source with the uploaded 0.11 ZIP:
all 705 baseline file paths retained; all 12 public asset files, all 5 local skill
and reference files, and all 96 original `.gitkeep` files preserved byte-for-byte.
The old root RELEASE manifest is historical input only: packaging generates a
new current manifest with SHA-256 for every included source file. The original
uploaded ZIP itself is unchanged. All planned business boundaries remain visible.

The package command runs structure/scope/contract checks and produces one
`reupmatic/` root, excluding dependencies, build output, caches, font binaries,
credentials, models, user media and nested archives. Its `RELEASE.json` is the
archive's file inventory. Final ZIP/hash/retention checks are reported alongside
the handoff; no successful installer or notification is implied by this report.

## Remaining scope and next version

This is not the finalized system. Composition remains bounded: no transitions,
layered video/audio tracks, per-clip effects/AI, composition batch/folder admission,
continuous final preview or comprehensive resource budgeting. 30 fps output is
frame-rounded; unusual VFR/rotation/SAR/codecs require acceptance work. The project
anchor is still required even after removing its clip. Library links are not a
complete derivation/deletion graph or all logical duplicate entries.

Project schema 3 is the only current reader. Earlier project documents are
rejected, not migrated, overwritten or silently reset. Library schema remains 2
and recovery table layout remains 1; old embedded projects are still rejected.

`docs/planning/scope-coverage.md` and `implementation-sequence.md` retain the full
backlog: independent transcript/translated/spoken/display layers and real speech
adapters; authorized Downloads; classification and independent endpoints;
Automation routing/triggers/schedules/recovery; verified OAuth/publication;
resource/model lifecycle; account/credits policies and owner release gates.
**Next source archive: 0.13**, prioritizing the independent text/speech foundation
through existing boundaries, followed by subsequent sequential versions. This is
an implementation order, not a promise of autonomous future work or approval of
unresolved commercial/product policies.
