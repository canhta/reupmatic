# Integration 0.8.0 — implementation and evidence

Date: 2026-09-15. Baseline: supplied `reupmatic-v0.7.zip`, package version 0.7.0.
Handoff: package version 0.8.0, `reupmatic-v0.8.zip`, source only.
The owner deferred full installation/UI/model verification and requested continued
implementation. No repeated registry installation or fabricated lockfile was used.

## Implemented slice

One strict local processing recipe now travels through Editor sample/full render,
manual batch and developer folder intake. Both OCR and removal are optional/off by
default. OCR observes the original before removal and burns generated captions;
existing cues or attached SRT conflict rather than being silently overwritten.
Manual OCR drafts remain a separate, explicit, undoable Editor operation.

Full-duration processing composes the existing vision service in bounded windows.
OCR windows stay on the sample grid and shrink against the worst-case raw-frame
budget. Removal creates ten-second FFV1 video-only chunks, joins them and performs
one final review MP4/audio encode. Private chunks are not final artifacts. Removal
remains capped at a 960-pixel longest edge and 24 fps. Source audio is transcoded
once, not byte-identically copied. Model performance/quality is not certified.

Batch/folder admission resolves required model fingerprints before committing.
The existing journal stores canonical recipe/pins; retries and restarts retain
them. An incompatible current configuration fails visibly. Recipe-bearing
projects use v2; ordinary projects stay v1 and old journal inputs remain valid.
Neither navigation, project opening nor editing recipe controls starts inference.

The host's former artifact check expected files immediately below renders, while
the real renderer publishes renders/<sha>/output.mp4. It now validates exact
artifact-ID/path layouts. Ordinary and processing renders share native encoding
and complete-recipe/output-hash cache checks. Inputs are content-hashed even when
size and mtime were restored. Cancellation covers all processing stages; owned
temporaries are cleaned, original files are preserved and queue close is awaited.

One ProcessingOptions domain composition uses Astryx across all three workflows.
MaskRegionFields owns percent/normalized geometry shared with standalone vision.
New progress, recovery and quality states exist in EN/VI. The module layout and
component rationale are documented; exactly one AGENTS.md remains at the root.

## Executed checks

| Lane | Result | Evidence / boundary |
| --- | --- | --- |
| TypeScript core | Exit 0 with available TypeScript 5.8.3 | `core-build.txt`; available Node type declarations, not target TS7/Node24 validation |
| Node core, architecture, UI policy and tooling | 124 passed, zero skipped/failed | `node-suite.txt`; static UI checks are not mounted interaction tests |
| TypeScript → real Python/FFmpeg bridge | 6 passed | `bridge-suite.txt`; media, queue/folder reconciliation, Library and model-configuration boundaries |
| Python discovery | 72 run: 71 passed, 1 skipped | `python-suite.txt`; missing pysubs2 round-trip is explicitly skipped |
| Recipe/persistence development checks | Passed | `processing-green.txt`, `persistence-green.txt`, `processing-queue-green.txt` |
| Window/cue/schema composition | 7 passed | `chunk-window-green.txt`; inference and serialization doubles are labeled |
| TypeScript source syntax/transpile | 82 implementation files, zero diagnostics | `ui-syntax.txt`; not dependency-aware typechecking |
| Full UI compiler | Blocked | `ui-typecheck-blocked.txt`: missing actual vite/client; no substitute library declarations |
| Supplied public assets | All 12 byte-for-byte matches | Direct comparison against supplied public.zip before packaging |
| Source architecture | Longest implementation file 274 lines | app/ui/i18n.ts; 111 TS/TSX/CTS/Python implementation/declaration files across app and worker, below 450-line guard |

The six bridge tests use actual native media and host-core boundaries. Folder
coverage exercises filesystem reconciliation, not installed Chokidar OS events.
The Python AI-native lane uses actual NDJSON/process/FFmpeg with controlled
RapidOCR/ONNX SDK modules written into temporary test directories. This is not
real-model inference evidence and those modules are never a production fallback.

The new full-duration test processes a 10.5-second source across the ten-second
boundary, verifies 252 decoded output frames, audio presence, matching model pins,
cache reuse and unchanged source bytes. Separate tests check sample subtitle
placement against original timestamps, cancellation/cleanup, changed model pins,
same-size/same-time source mutation and cache-recipe mismatch. OCR composition
checks cue merging across grid-aligned windows and blank-interval separation;
the real pysubs2 serializer is unavailable here. The explicit missing-component
case fails without substituting a handwritten parser.

An initial aggregate run was interrupted before a complete summary; its partial
log is `python-first.txt` and is not a pass. The subsequent `python-suite.txt`
contains the complete 72-test result. The command transport reported a timeout
afterward; inspection confirmed the final unittest summary and no remaining test
or worker processes. Isolated worker and processing-native runs also completed.
Red logs record the absent recipe/window interfaces before their implementation.

## Commands and environment

Available: Node 22.16.0, TypeScript 5.8.3, Python 3.13.5, FFmpeg/ffprobe 7.1.5,
NumPy/OpenCV and test-only jsonschema. Application npm dependencies, Biome, Ruff,
installed Chokidar, Electron and pysubs2 are absent. Manifest targets are inherited,
not a verified compatible/current package set.

```sh
tsc -p tsconfig.core.json --typeRoots /opt/nvm/versions/node/v22.16.0/lib/node_modules/ts-node/node_modules/@types
node --test tests/architecture.test.mjs tests/ui-library.test.mjs tests/tooling.test.mjs \
  tests/core.test.mjs tests/render-tracker.test.mjs tests/media-response.test.mjs \
  tests/render-coordinator.test.mjs tests/project.test.mjs tests/batch.test.mjs \
  tests/folder.test.mjs tests/design-skill.test.mjs tests/vision.test.mjs \
  tests/library.test.mjs tests/settings.test.mjs tests/export-file.test.mjs \
  tests/processing.test.mjs tests/processing-persistence.test.mjs tests/render-artifact.test.mjs
node --test --test-concurrency=1 tests/bridge.test.mjs tests/coordinator-native.test.mjs \
  tests/batch-native.test.mjs tests/folder-native.test.mjs tests/library-native.test.mjs tests/models-native.test.mjs
python -m unittest discover -s tests -p 'test_*.py' -v
tsc -p tsconfig.ui.json --noEmit
```

A separate diagnostic inspection using available Node declarations still reports
missing React/Astryx/specialist package declarations. It is not a green UI check.
No declaration stubs, force-installed peers or invented lock integrity data were
added. Bootstrap, formatting and target-toolchain issues remain owner-side gates.

## Review and remaining limits

Standards review: business ownership is explicit in core/processing, worker/processing
and UI/processing. Media cache/encoding modules are shared by two real callers;
there is no second scheduler or prop-for-prop primitive library. Entry points compose
lifecycles. Public bytes, original data and historical release records are retained.

Specification review: steps are off by default, cue/SRT conflicts fail safely,
queue inputs are immutable, model changes cannot silently alter a retry, folders
remain developer-gated/paused on restart, progress remains correlated and final
outputs are not advertised from unfinished chunks. Parent source/model verification
is distinct from cheap between-chunk checks. Full duration does not certify native
resolution or temporal quality.

Not verified: complete UI/Electron build with actual pinned dependencies, Biome/Ruff,
keyboard/focus/IME and EN/VI screenshots, JASSUB/native pixel parity, actual SDK/model
accuracy/performance/licensing, GPU behavior, target-platform SQLite/FFmpeg and
installers. No SRT sidecar from automatic full processing, general workflow/profile
editor, automatic SRT matching, dubbing, downloads, account/channel posting or
commercial authorization was added. Read the processing guide before owner checks.

## Source package

The source packager synchronizes 0.8.0 metadata, refuses equal/older versions in the
release directory and regenerates RELEASE.json with hashes. The delivered archive
has one reupmatic/ root and excludes dependencies, compiled output, models, fonts,
user media and temporary SDK fixtures. Source verification is not installer approval.
Archive integrity, per-file hashes and original public bytes are checked after creation.
