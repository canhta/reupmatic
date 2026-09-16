# Reupmatic 0.6.0 — source handoff verification

Recorded 2026-09-15. Baseline: the owner's `reupmatic-v0.5.zip`.
Delivery: `reupmatic-v0.6.zip`, application version **0.6.0**.

**Source-only integration. Not an installer, a passed Electron UI build, an
approved model stack or a production release.** No actual model weights, fonts,
third-party executables, dependency directories or compiled bundles are shipped.

## Implemented scope

The existing saved batch queue and folder intake remain. The new independent
Editor vision path uses the same host/worker execution queue: model availability,
bounded timed OCR drafts, manual-rectangle or automatic text-mask LaMa samples,
progress, cancellation, checksum validation and revision-protected draft use.
Raw recognition evidence is separate from edited subtitles. Source videos are not
overwritten. OCR is limited to 120 seconds; removal to a 10-second, 24 fps proxy,
longest side 960 pixels. Full-video removal and temporal quality are not delivered.
Vision is not silently added to batch/folder rules or approved commercial policies.

Business ownership is explicit inside each runtime: UI features, core capabilities,
host feature IPC, and Python runtime/assets/media/subtitles/vision. See
[the source map](../../docs/architecture/source-layout.md). Root `AGENTS.md` is the
only instruction file and contains the owner's structure, comment, deduplication,
nontrivial-wrapper, Astryx-selection and increasing-version rules.

The supplied engineering skills are adapted, not represented as a verbatim install
of every upstream skill. The original UI skill reference is retained. Astryx owns
controls and theme; specialist timeline, WaveSurfer and JASSUB remain. UI selection
is documented per user task, with a public catalogue and explicit exceptions.
Source CSS is feature-local and no longer reaches into library primitive controls.

## Executed checks

The authoritative latest outputs are `release-*.txt` with command/exit metadata in
[release-command-results.json](release-command-results.json). A report is evidence
of the listed scope only, not of unexecuted acceptance gates.

| Check | Result | Boundary |
| --- | --- | --- |
| Core compilation | PASS | System TypeScript 5.8.3 with explicit globally available Node type roots; not the manifest's installed toolchain |
| Node core/policy/tooling suite | **86 passed, 0 failed** | Includes source architecture/UI policy/message guards, editor/core, persistence, queue, folder and vision contracts |
| Native bridge suite | **4 passed, 0 failed** | Real host/core → Python → FFmpeg; folder reconciliation is driven directly, not by installed Chokidar |
| Python suite | **48 total: 47 passed, 1 skipped** | Contracts, packaging, worker, vision algorithms and controlled-adapter FFmpeg tests |
| Python skipped case | NOT VERIFIED | `test_library_subtitle_edit_round_trip`: `pysubs2` unavailable; no substitute parser |
| Source syntax/local imports | PASS | 56 TS/TSX/CTS files parsed, no missing relative imports; Python syntax also parsed |
| E2E source syntax | PASS | `node --check` only; does not launch Electron or exercise Astryx |
| Source packaging behavior | **6 passed**, included in Python count | Numeric version order, no overwrite, synchronized metadata, filters, duplicate rules, symlinks and per-file SHA-256 |

The vision tests deliberately use controlled inference adapters for predictable
OCR/mask results. FFmpeg still encodes real MP4/audio and checks cancellation and
output properties. **Those tests do not demonstrate RapidOCR/ONNX/LaMa inference,
recognition accuracy, temporal quality or model license compliance.** Before-lossy-
encoding mask preservation is not a claim of bit-identical pixels in final MP4.

Core compilation was run as:

```sh
tsc -p tsconfig.core.json --typeRoots /opt/nvm/versions/node/v22.16.0/lib/node_modules/ts-node/node_modules/@types
```

Full commands are machine-readable in the command results. Do not add that local
global-type path to project configuration or use it as a production dependency.

## Blocked or not executed

| Gate | Observed outcome |
| --- | --- |
| Registry metadata / installation | `npm view @astryxdesign/core@0.6.1 version --fetch-timeout=5000 --fetch-retries=0` failed with `EAI_AGAIN`; no successful install and no genuine lockfile |
| `npm run typecheck` and `npm run build` | Failed because installed Node types/dependencies are absent; not passed via shims or substitute declarations |
| `npm run check` / `npm run check:python` | Biome / Ruff absent; formatting and lint are unresolved gates, including inherited dense legacy formatting |
| `npm run astryx -- component` | CLI package absent; exact installed exports, props, theme/i18n peers and specialty-library compatibility remain unverified |
| `tests/chokidar.test.mjs` | Failed to load missing Chokidar; actual watcher events not tested |
| Electron / Playwright E2E | NOT RUN. Updated source uses Selector options, RadioList and AlertDialog rather than obsolete native selectors |
| EN/VI visual/accessibility acceptance | NOT RUN. No genuine screenshots, IME, keyboard/focus return, responsive or computed-contrast certification |
| Actual RapidOCR and ONNX LaMa | NOT RUN: optional runtimes/weights missing; package/version/model-shape compatibility, quality and licensing still need verification |
| Shipping / target OS | NOT RUN: no signed installers, bundled Python/FFmpeg/models, Windows/macOS or GPU/performance approval |

Public Astryx documentation/source was read on 2026-09-15, and the manifest targets
0.6.1. Upstream `main` is not the exact installed package. The inventory therefore
keeps `packageVerified: false`. It is not a complete installed-export audit or a UX
score. CI includes architecture/UI-policy checks, but no remote CI run is claimed.

## Review findings and corrections

**Structure/readability review:** separated mixed editor concerns, queue draft and
saved-job responsibilities, folder draft and live rule control, host IPC and Python
worker concerns. Shared IPC reply decoding lives at its real integration boundary.
TimeInput owns media units; confirmation owns promise/cancel/unmount lifecycle.
Astryx controls are imported directly, without a parallel Button/Input wrapper
library. The 450-line source guard is a backstop, not a reason to compress code.
No full formatter pass is claimed while Biome/Ruff are unavailable.

**Behavior/specification review:** retained source references, explicit start/save,
independent monitoring/queue pause, no new billing/public actions, bounded local
model work, cancellation and stale-result protections. No Plus entitlement,
category classification or full text-removal workflow acceptance is inferred.

Tests caught import paths left behind after refactoring, an old contract test
importing `main.py`, legacy CSS reaching library controls, missing confirmation
translations, nonexistent model-setup file references and obsolete E2E selectors.
These were corrected rather than bypassed with forwarding aliases or skipped
assertions. Both red and green logs are retained.

Earlier `final-*` and `refactor-*` files are historical intermediate runs; some
contain the failures subsequently fixed. They are not the final status. The latest
`release-node-tests.txt`, `release-python-tests.txt` and this report supersede them.
Source guards for E2E selectors and labels are not runtime interaction tests.

## Environment and provenance

See [environment.json](environment.json), [source-provenance.json](source-provenance.json)
and [source-inspection.json](source-inspection.json). Actual local environment:
Linux x86_64, Node 22.16.0, Python 3.13.5, TypeScript 5.8.3, FFmpeg 7.1.5.
The intended Node 24 / newer declared tools are not verified by these local runs.
No Git metadata/commit was supplied in the baseline ZIP. Its SHA-256 is:

`d377e451dc6362c6937364b0ad7e66248900493c8d17bdf5a39a5786951f68a9`

## Continue from this archive

Install and resolve declared dependencies in a networked checkout, review the real
lockfile, run format/lint/type/build/native/UI gates, then exercise trusted local
models following [local-models.md](../../docs/development/local-models.md). Inspect
actual EN/VI states before calling the Astryx migration visually approved.

Package with `npm run package:source -- --output-dir ../releases`. The manifest,
README and changelog must agree. The packager compares existing versions in that
release directory and refuses duplicate/older versions; keep prior delivered
archives there because deleted or externally published versions cannot be detected.
Future edits after this delivered 0.6.0 require a newer version. The ZIP contains
one `reupmatic/` root and a `RELEASE.json` with SHA-256 for each included source file.
