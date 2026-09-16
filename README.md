# Reupmatic — Integration Build 0.15.0

**Source handoff continuing the supplied 0.14.0 archive.** Spoken-layer local
synthesis now connects Editor, typed native IPC and the existing worker queue.
This is not a desktop binary or a finalized system. Real model/voice quality and
installed Electron/UI acceptance remain unverified.

## New in 0.15

| Area | Implemented slice |
| --- | --- |
| Local speech | Explicit spoken-cue scope, preset voice, VI/EN declaration and native hash-pinned model setup; bounded VieNeu v3 Turbo ONNX/CPU adapter. No download, cloning or cloud fallback. |
| Reviewable artifacts | Captured words/source clocks, natural sequential 48 kHz PCM16 WAV, actual per-cue frame spans and a private JSON provenance receipt. Audition plus explicit manual review before native save. |
| Integrity | Model and output verification, worker correlation, source-token/text/timing/language invalidation, post-dialog stale guard and atomic per-file save. Protect imported originals, selected model files and admitted drafts. |
| Failure handling | Existing shared queue, reaped/cancellable inference child, bounded input/audio/token checks, failed-retry draft retention and scratch cleanup. No automatic soundtrack, subtitle or video changes. |

[Current verification](research/integration-0.15/RESULTS.md) ·
[Speech setup, use and limits](docs/development/local-synthesis.md) ·
[Skills review](research/integration-0.15/SKILLS_REVIEW.md) ·
[Translation](docs/development/local-translation.md) ·
[Text layers / STT](docs/development/local-speech.md) ·
[Composition](docs/development/local-composition.md) ·
[Full scope and gaps](docs/planning/scope-coverage.md) ·
[Next slices](docs/planning/implementation-sequence.md).

All supplied source paths, public assets, skill files and reserved markers are
retained. Existing composition, Library, soundtracks, STT, translation, rendering,
batch and workflow slices remain. Speech is direct-Editor only, not a durable
batch/workflow stage. Voice output is **natural and unaligned**. Alignment/mixing,
Downloads/classification, connected publication, complete Automation, resources
and account work remain. Next increment: **0.16**, reviewed voice timing/alignment
and its explicit audio-integration boundary, without silently changing manual text.

## Greenfield data rule

The current **project schema stays 5**, with **text-layer version 2**, unchanged
from 0.14. Existing schema-5 projects use the same contract; no migration is added.
Applied translations retain provenance. Speech audio drafts/review are session-only,
not embedded in projects/recovery or automatically restored on reopening. Save WAV
and its receipt explicitly; these are separate native file transactions. Earlier
unsupported project formats still fail intact without migration/reset/rewrite.
Library schema remains 2; recovery table schema remains 1. Keep original media and
older release archives.

## Library and Settings after setup

Open **Sources → Library**, choose reference or copy storage and the duplicate
policy, then select local videos. Imported files are catalogued, not rendered.
Open a record in **Editor** to edit; saves made from that record are linked back
to it. A composition also retains exact-member project/export links for known Library content. Choose **Related assets** to open the Assets view. It can reopen an exact linked project against its verified Library source, or preview a linked export, subtitle or audio file.
Moving a source requires **Locate moved source** and matching content bytes.

To process several Library items, select them on the current page and choose
**Prepare batch**. This stages the existing **Automation → Batch & jobs** draft;
choose an output directory, optionally attach each video's SRT, enqueue, then
start the queue. No render starts from a selection, import, navigation or settings
change. [Local Library behavior and storage](docs/development/local-library.md)
describes limits, provenance and non-destructive removal.

In **Settings → General**, choose a starting directory for future native save
and output-folder dialogs. Existing queue destinations do not change.
**Settings → AI & processing** can select an existing local model manifest;
validation is cancellable and never downloads weights. The same setup action is
available beside Editor vision tools. Account/plan services, online downloads and
channel publishing are explicitly unconnected, not simulated.

## Local processing after setup

The following AI tools operate on single-source projects, not compositions. Configure local models in **Settings → AI & processing** first. Open a local video
in **Editor** and select optional steps under **Processing recipe**. Render a
sample or the full video explicitly. OCR reads the original before any removal
and burns generated captions into the output; it does not replace Editor cues or
export a separate SRT in this release. Existing cues can be used with removal,
but conflict with automatic OCR. Review the output before relying on its quality.

The independent **Local vision** tools still support a bounded OCR draft that you
can apply/undo in Editor, and a short removal sample. Full-duration recipes use
that existing inference service in bounded chunks rather than adding a new engine.
No lossless final-processing, native-resolution removal, temporal-quality approval
or non-text logo detector is claimed.

For batches, choose the recipe in the existing draft before **Add to queue**. For
folder rules, save the recipe with the rule. Starting monitoring and starting the
queue remain separate, explicit actions. Recipe/model snapshots are retained by
accepted jobs; changing Settings never rewrites those jobs.

[Processing behavior and recovery](docs/development/local-processing.md) explains
execution order, limits, restart/retry and model changes. [Model setup](docs/development/local-models.md)
explains local manifests, dependencies, model shape and licensing. Model files are
not bundled and no automatic downloads are added.

## Local folder preview after setup

```sh
npm run build
npm run start:automation
```

Open **Automation**, choose source/output folders, choose first-run scope and save
the rule. Start monitoring explicitly. Open **Batch & jobs** and start the queue to
render admitted videos. Monitoring and queue pause are independent; reopening the
app leaves rules paused. The source-only developer flag is not Plus authorization.

Folder rules export MP4 with source audio when present and can carry optional
local OCR/LaMa recipes into the existing queue. Sidecar matching, flexible workflow
steps/triggers, production entitlement and publishing remain separate work. See [folder behavior](specs/folder-intake.md).

## Development setup

Target Node 24 LTS, Python 3.14 (worker source >=3.12), FFmpeg/ffprobe with libass, and native encoders used by the tests. End users must not need to install this toolchain in a release; bundling remains an unpassed gate.

```sh
python -m venv .venv
# Desktop and npm scripts discover .venv automatically; PYTHON is an explicit override.
# On Windows PowerShell: .\.venv\Scripts\Activate.ps1
# On macOS/Linux: . .venv/bin/activate
node scripts/python.mjs -m pip install -r worker/requirements-dev.txt
npm install
npm run check
npm run check:python
npm run typecheck
npm run build
npm test
npm start
```

**Bootstrap status:** the supplied source baseline has no installed application dependency tree or resolved lock. This pass attempted a registry metadata check and the declared Python subtitle/tooling pins; dependencies remain unavailable. Feature implementation continued without substituting package APIs or manufacturing a lockfile. Existing package pins are inherited targets, not a verified compatible or current set. Full host/UI typecheck and build are not passed. There is no `package-lock.json` to fake reproducibility. Resolve packages, review remaining lint/build diagnostics, commit the real lock, then use `npm ci` thereafter. The selected timeline's published artifact and JASSUB assets still need verification. The initial type-declaration ranges are not verified latest pins.

`PYTHON`, `FFMPEG_PATH` and `FFPROBE_PATH` are development executable overrides, not new user-facing API-key/Settings workflows. Python npm commands discover the local `.venv`; Electron also discovers the project virtualenv before falling back to a system interpreter.

## Daily commands

| Command | Purpose |
|---|---|
| `npm run format` / `npm run lint:fix` | Explicit Biome formatting / safe fixes and import organization. Review changes before staging. |
| `npm run check` / `npm run typecheck` | Biome CI-style validation / actual TypeScript checking. |
| `npm run check:python` / `npm run format:python` | Ruff validation / explicit Python fixes and formatting. |
| `npm run hooks:install` | Install Lefthook after entering a real Git checkout. ZIP extraction alone installs nothing. |
| `npm run structure:scaffold` | Create missing reserved `.gitkeep` markers without overwriting files. |
| `npm run contracts:generate` / `npm run contracts:check` | Compose canonical business schemas / detect drift in embedded wire contracts. |
| `npm run scope:generate` | Regenerate human-readable system and scope maps after deliberate JSON edits. |
| `npm run structure:check` / `npm run scope:check` | Check preserved paths, declared modules, scope groups and generated views. |
| `npm test` | Architecture, UI policy, tooling, core, bridge and Python scenarios; native prerequisites required. |
| `npm run package:source -- --output-dir ../releases` | Version-checked source ZIP; preserves earlier archives. |
| `npm run deps:check` | Existing `npm outdated`; update PRs are configured through Dependabot, not a custom updater. |

Pre-commit is check-only for staged paths; pre-push runs typecheck and fast tests. Rendering, models and paid/external actions never run in a commit hook. Configuration details and partial-staging limitations are in CONTRIBUTING.

## Shared worker batch harness

After compiling the core, provide a JSON array of authorized local files:

```json
[
  {"video": "/absolute/path/first.mp4", "srt": "/absolute/path/first.srt"},
  {"video": "/absolute/path/second.mp4"}
]
```

```sh
npm run build:core
node scripts/batch.mjs /path/to/manifest.json /path/to/new-workspace
```

This developer command uses the same BatchStore, BatchQueue, RenderCoordinator
and worker as the application. It requires a **new, nonexistent workspace** to
avoid starting unrelated desktop jobs. The workspace retains its journal and
exports; a repeated invocation against that directory is refused. One failed
item does not stop valid items. Originals remain references; no alternate batch
engine, production Automation permission or commercial policy is introduced.

## Saved queue runtime note

The local stores are `integration-workspace/batch.sqlite`, `library.sqlite`,
`folders.sqlite`, `catalog.sqlite` and `editor-recovery.sqlite` under Electron user data; keep its WAL/SHM sidecars with the live database. Do not put this database on a network share, open it from two app instances, remove it to hide an error, or treat it as disposable render cache. Basic `node:sqlite` behavior is covered only in the recorded Node 22.16.0 environment, not the target Node 24 or packaged Electron runtime. Its availability and filesystem behavior must be checked in the chosen packaged Electron version on Windows/macOS; Library and batch report their own unavailable state without blocking direct Editor opening when initialization fails.

## Release boundaries

This greenfield release does not migrate, downgrade or delete earlier development
workspaces. Current schema checks fail explicitly on unsupported data. Original
media is never moved by startup. Historical evidence and archives are retained
for traceability, not as a commitment to old runtime APIs.

No first-party Rust, new engine, duplicate formatter/hook stack, long onboarding wizard or reduced feature scope is introduced. No third-party model weights, fonts, FFmpeg/interpreter executables, node_modules or built UI bundle is included. Compiled directories are excluded from the source ZIP; rebuild from source in the resolved environment. Run actual UI/target-OS/model/license gates before release.

## Additional checks

```sh
# Once the genuine dependency lock and installed tools are available:
npm run test:core       # project, Library, preferences, safe saves and SQLite queue
npm run test:bridge     # Library/project/batch -> Python/FFmpeg and model configuration
npm run test:e2e        # builds and launches Editor, batch and folder Electron scenarios; fails on missing dependencies
# Linux without a display: xvfb-run -a npm run test:e2e
```

The Electron tests use synthetic local fixtures and isolated application data. Only native file-picker choices are controlled; media/render results are not mocked. Linux UI tests do not certify macOS/Windows installers, GPU performance, OCR/LaMa, JASSUB/native pixel parity or IME keyboard behavior.

## Package this source

The synchronized project version is `0.14.0`; its source archive is
`reupmatic-v0.14.zip`. The next handoff is 0.15.0, then 0.16.0. Run `npm run package:source -- --output-dir ../releases`
after updating package metadata, this heading, CHANGELOG and the matching RESULTS
report. The packager refuses an equal/newer archive, excludes generated/runtime
artifacts, retains the original public assets and generates `RELEASE.json` with
SHA-256 for every included source file. It does not build an Electron installer.
