# Integration 0.7.0 — implementation and evidence

Date: 2026-09-15. Baseline: owner-supplied `reupmatic-v0.6.zip` (0.6.0), not the
older alternate `reupmatic-v6.zip`. New handoff: `reupmatic-v0.7.zip` (0.7.0).
The owner delegated full application verification; implementation continued without
claiming missing-package, UI, target-platform or real-model checks succeeded.

## Delivered behavior

- SQLite local Library: explicit reference/copy and duplicate policy, persisted
  source identity, bounded paged search, missing/changed status, same-byte relink,
  best-effort associated-file indexing and non-destructive listing removal.
- Library → Editor/project and Library → existing batch draft/queue. Preserve exact
  Library identity through saved job input and record completed output links across
  restart. No duplicate execution queue or automatic rendering from selection.
- Settings: strict atomic preferences, native-picked future output-folder defaults,
  runtime facts, local model-manifest validation/configuration and cancellation.
  Respect explicit environment override; never install, download or infer on setup.
- Sources/Settings composed with documented Astryx controls, single mounted batch
  state and EN/VI messages. Restore the previously omitted Vietnamese vision resource
  spread. Retain specialist media controls and avoid primitive wrapper layers.
- Host runtime/features separation, shared source protection, verified temporary
  export publication, revision-protected Editor opens/imports and IPC shutdown drain.
  Source/artifact aliases are protected; prior exports survive pre-commit failure.
- Restore all 12 owner-provided public assets exactly, wire logo/icons and fix source
  packaging extensions. Retain the original manifest without activating its /content
  start URL. Inventory: `docs/architecture/public-assets.json`.

## Executed evidence

| Lane | Result | Evidence and meaning |
| --- | --- | --- |
| Node architecture/UI-policy/tooling/core | 110 passed | `node-tests.txt`; structural guards, existing core behavior, new Library/preferences/export/provenance scenarios. No browser execution. |
| Native bridge | 6 passed | `bridge-tests.txt`; real TypeScript → Python/FFmpeg, SQLite queue/folder/Library integration and worker model-configuration protocol. |
| Python complete suite | 57 passed, 1 skipped | `python-tests.txt`, assembled from two completed groups covering all seven test modules. `pysubs2` round-trip skipped explicitly. |
| Core TypeScript compilation | Exit 0 | `core-typecheck.txt`; actual available TypeScript 5.8.3 with preinstalled Node declarations, not the manifest toolchain. |
| TypeScript/TSX parser and resource-key inspection | 78 parsed source files, no syntax diagnostics; EN/VI keys match | `source-review.txt`; not package type checking or UI execution. |
| UI/Electron TypeScript attempt | Blocked, not passed | `ui-typecheck-attempt.txt`, `host-typecheck-attempt.txt`; missing installed dependency declarations. |

A full Python discovery attempt exceeded the tool command deadline; its unfinished
log is retained as `python-discovery-attempt.txt`, not counted as success. The
same complete module set subsequently passed in two finished groups (43 + 15 cases,
with one explicit skip). `new-native-tests.txt`, `feature-tests.txt`, red/green logs
and `final-save-tests.txt` are supporting slice runs, not additional unique totals.

The native Library scenario generates actual video/audio, imports and copies it,
relinks the same source bytes, saves/reopens a project, executes the existing SQLite
batch through Python/FFmpeg, validates audio/output and reloads persisted links.
It is not an Electron picker or visual test. Model-configuration testing uses clearly
labelled invalid-as-inference fixture bytes solely to exercise schema/checksum/
persistence/rollback; no fake model is included in production configuration.

Python vision pipeline cases use actual subprocesses and FFmpeg with controlled
RapidOCR/ONNX adapter doubles. They establish queue/progress/cancellation, geometry,
output/audio and original-preservation behavior, not actual OCR accuracy, LaMa
quality, ONNX compatibility or licensing. `verified: false` remains the status
contract even after a manifest's bytes pass validation.

## Actual environment and reproducibility

Available: Node 22.16.0, TypeScript 5.8.3, Python 3.13.5 and FFmpeg/ffprobe. SQLite
runs emitted the Node experimental warning, retained in logs. These are not a pass
for target Node 24, Python 3.14, the inherited Electron/TypeScript/React/Astryx pins,
or a packaged Windows/macOS runtime. No version pin was silently redefined as tested.

Core command used the available Node declarations:

```sh
tsc -p tsconfig.core.json --typeRoots /opt/nvm/versions/node/v22.16.0/lib/node_modules/ts-node/node_modules/@types
```

This absolute path records the execution environment, not a project dependency or
an installation instruction. Use the real installed dependencies for normal npm
scripts. Registry DNS was unavailable; no node_modules, fabricated lockfile, fake
type declarations or guessed integrity hashes were introduced. Resolve dependency
compatibility, install and commit a genuine lock before treating builds as reproducible.

## Not executed / not delivered

Not executed: full installed UI/Electron build, Biome/Ruff, installed watcher lane,
Electron E2E and Library/Settings interaction, EN/VI screenshots, IME/focus/keyboard,
real OCR/LaMa inference/quality, target-OS integration or installers. Syntax/source
guards and native headless tests cannot substitute for these gates.

Not delivered by this slice: online download connectors, connected channel posting,
account/plan billing, complete tagging/profile/workflow features, whole-video LaMa,
vision operations in batch/folder automation, temporal model quality or automatic
asset cleanup. Folder monitoring retains its explicit source-only developer gate;
this is not Plus authorization. Removing Library listings deletes no source files.

## Packaging contract

One root `AGENTS.md` retains all owner rules and local engineering/UI skill links.
Source files must remain within the existing 450-line implementation ceiling;
entry points compose cohesive modules rather than hide compressed monoliths.
The source packager synchronizes README/package/CHANGELOG/evidence, rejects equal
or older versions, preserves prior ZIPs, includes public bytes and embeds per-file
SHA-256 in `RELEASE.json`. No fonts, weights, executables, dependencies, caches or
compiled output are included. This artifact is source-only, not an installer.
