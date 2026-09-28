# ADR 0002 — Runtime packs installed at setup

Status: accepted (owner-approved architecture change, 2026-09-26)

## Context

`scripts/package-python.mjs` stages one relocatable CPython with every local runtime, so the
installer carries the vision OpenCV/RapidOCR stack and the VieNeu synthesis stack whether or not
the user ever installs a Vision or synthesis model. Even after pruning unused dependencies
(`perf(packaging): prune the bundled Python runtime and its dependency closure`) the stage is
~470 MB, and most of it is two opt-in domains.

Recognition (faster-whisper) and translation (CTranslate2) are the engine most users run; Vision
and Vietnamese narration are opt-in and each needs a large, distinct dependency set. Shipping them
eagerly makes every download heavy and every future engine version a full-app release.

## Decision

Split the Python payload into a **base** and per-application **runtime packs**.

- **Base** (`resources/python`, always installed): CPython, the worker, `pysubs2`,
  faster-whisper (and its `av`, `ctranslate2`, `tokenizers`, `huggingface_hub`, `numpy`,
  `onnxruntime`, `tqdm` closure) and CTranslate2/SentencePiece translation.
- **Runtime pack**: a per-platform archive of a `pip --target` site directory built against the
  exact bundled CPython, with a name, version and SHA-256. Vision and synthesis ship as two packs.
- A model install whose engine needs a pack installs that pack first, with its size shown in
  Settings. Nothing is installed silently.

### Shared dependencies live in the base

`numpy`, `onnxruntime`, `tokenizers`, `huggingface_hub`, `requests`, `PyYAML` and `tqdm` are
required by faster-whisper, which is always in the base. Both packs need some of them, so they stay
in the base and each pack ships only its exclusive distributions:

| Pack | Exclusive distributions | Measured |
| --- | --- | --- |
| `vision` | opencv-python-headless, rapidocr, pillow, shapely, pyclipper, omegaconf, antlr4-python3-runtime, colorlog, six | ~178 MB |
| `synthesis` | sea-g2p, vieneu, soundfile, soxr | ~77 MB |

The alternative — a third `onnxruntime` pack both depend on — was rejected: it adds a dependency
graph, a third download and a third failure mode to share ~75 MB that the base already carries for
recognition. Duplicating `onnxruntime` inside both packs would put one distribution on disk twice.
No distribution appears in both the base and a pack, or in two installed packs.

Measured on `darwin-arm64` (2026-09-26): base ~230 MB, vision pack ~178 MB, synthesis pack ~77 MB.
The target is a base ≤ ~250 MB; every dependency the packs share is already in the base.

### Pack identity and layout

```json
{
  "name": "vision",
  "version": "2026.09.26",
  "platform": "darwin-arm64",
  "url": "https://github.com/canhta/reupmatic/releases/download/v0.1.0/vision-darwin-arm64-2026.09.26.tar.gz",
  "sha256": "…64 hex…",
  "size": 186000000
}
```

Platforms are `darwin-arm64`, `darwin-x64`, `win32-x64` (the platforms the release workflow
packages). The archive extracts to one directory whose contents are the `pip --target` site tree;
the worker adds each installed pack to `PYTHONPATH`. The generated manifest is a build artifact
(see below), never committed.

### Build and publish

`scripts/package-runtime-packs.mjs` builds packs for the current platform with the exact staged
interpreter, then the release workflow:

1. `pnpm run stage:python` (base only — synthesis and vision requirements are not installed).
2. `pnpm run stage:packs` — builds `vision` and `synthesis` archives plus a manifest fragment.
3. On macOS, codesigns every Mach-O in each pack with the release Developer ID and a secure
   timestamp before archiving (see below).
4. Uploads each archive as an asset of the same GitHub release.
5. `scripts/runtime-packs-manifest.mjs` merges the fragments into `runtime-packs.json`; the app
   build embeds it. Both the archives and the manifest are gitignored.

### macOS signing

`build/entitlements.mac.plist` grants `com.apple.security.cs.disable-library-validation` so the
signed app can load third-party `.dylib`/`.so` files. A pack's native libraries are unsigned data
downloaded after install, so Gatekeeper/library validation would otherwise reject the process. The
release workflow therefore signs every Mach-O inside each pack with the same Developer ID identity
and `--timestamp` used for the app, before the archive is created. The pack is data, not code: it
is not notarized separately; the app bundle is, and the library-validation entitlement covers the
runtime-loaded pack libraries.

### Install lifecycle

The host installs a pack by:

1. resolve the manifest entry for `(name, current platform)`; absent → `RUNTIME_PACK_UNAVAILABLE`;
2. download to a temporary file, metering progress (`PACK_DOWNLOAD_FAILED` on a failed response);
3. verify the SHA-256 (`PACK_HASH_MISMATCH`) and that the size matches;
4. extract to `userData/runtime-packs/.staging-<uuid>` and re-check nothing escaped the directory;
5. atomically `rename` into `userData/runtime-packs/<name>/<version>`;
6. write the installed record last.

An interrupted or failed install removes the staging directory and the version directory if the
rename already happened, so nothing half-present survives. `CANCELLED` aborts at any step.
Uninstall removes `<name>/<version>`. Offline, cancel and checksum mismatch each map to a named
error code; no step silently falls back to a system runtime.

Installed packs are resolved on every worker launch:

- packaged: `userData/runtime-packs/<name>/<version>` for each installed pack, in a stable order;
- dev (`pnpm dev`): `python/runtime-packs/<name>/<version>` from local staging, so synthesis and
  vision keep working without a release; when absent, the engine reports `RUNTIME_PACK_MISSING`.

### Engine status

Vision and synthesis no longer have a bundled runtime, so a missing module means a missing pack: the
worker reports `RUNTIME_PACK_MISSING` instead of `MODEL_RUNTIME_MISSING`, and the Settings row
routes the user to install the pack. Recognition and translation keep `MODEL_RUNTIME_MISSING`
because their runtime is always base.

## Consequences

- The installer carries ~230 MB of Python instead of ~470 MB.
- The first Vision or synthesis model download also downloads its pack, once, with its size shown.
- A pack version is independent of the app version; bumping an engine does not require a full app
  release, but a pack built against a different CPython minor is rejected at manifest generation.
- More moving parts: a build step, a manifest, a signed archive and an installer. The pack
  installer is pure logic with fixture archives and a local HTTP server in tests; no test downloads
  a real pack or model.
- First-run health is unchanged: no pack is installed until the user installs a model that needs it.
