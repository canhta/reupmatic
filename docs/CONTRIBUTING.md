# Contributing to Reupmatic

## Toolchain

Use the Node line in `.nvmrc` (24 LTS), the Python version in `.python-version` (3.14), and native
FFmpeg/ffprobe built with libass. The repo is pnpm-managed —
`pnpm-lock.yaml` is the committed lock. Script bodies shell out to `npm run`, so invoke them as
`pnpm run <script>`; never run bare `npm install` against the committed lock.

## Bootstrap

```sh
python -m venv .venv
# Activate .venv for desktop launches, or set PYTHON explicitly.
# The Python npm scripts discover .venv automatically.
node scripts/python.mjs -m pip install -r worker/requirements-dev.txt
pnpm install
pnpm run check
pnpm run check:python
pnpm run typecheck
pnpm run build
pnpm test
```

Commit the updated `pnpm-lock.yaml` with any manifest change. CI uses
`pnpm install --frozen-lockfile`, so a stale lock fails the build.

### Optional model runtimes

Recognition, synthesis, translation and vision each need a Python runtime beyond
`requirements-dev.txt`. The app never installs them itself — install all of them, or only the
domains you need:

```sh
node scripts/python.mjs -m pip install -r worker/requirements-optional.txt
# vieneu and rapidocr ship dependency metadata broader than the worker's code paths; their real
# dependencies come from the domain files above.
node scripts/python.mjs -m pip install --no-deps -r worker/requirements-sources.txt
```

Individual files are `worker/requirements-{speech,synthesis,translation,vision}.txt`. A model
downloaded from the app still cannot run until its domain runtime is present; the matching
Settings row reports the missing runtime.

### Wire contracts

Run `pnpm run contracts:generate` before anything that talks to the worker. It composes the
gitignored schemas under `contracts/` from the tracked `*.source.schema.json` files and generates
`worker/runtime/operations.py`, which `worker/runtime/worker.py` imports directly. Without it the
worker exits on import and reports `WORKER_EXITED`. `test:core`, `test:bridge`, `test:python`,
`test`, `pnpm run build` and `pnpm run dev` each run it first.

## Checks and hooks

**Biome** owns JS/TS/JSX/TSX, JSON, CSS and supported HTML — formatting, linting and import
organization. **Ruff** covers first-party Python. `tsc` is the type-check gate. There is no
ESLint/Prettier/Husky duplication.

Lefthook installs during `pnpm install` at this checkout's own Git root, outside CI. A ZIP is not a
Git checkout; after placing one in a repository, run `pnpm run hooks:install`.

- **Pre-commit:** checks the staged paths with Biome and Ruff. No auto-fix, staging, rendering,
  model downloads, network calls or paid actions.
- **Pre-push:** typecheck and fast core/tooling tests. Heavier checks belong in CI or explicit
  developer commands.

The hook checks working-tree content at staged paths; it does not isolate staged blobs, so a
partially staged file can need manual attention. Run `pnpm run lint:fix` or
`pnpm run format:python` deliberately, review, then stage again.

### Local environment files

`.env.local` must exist for `dev`, `test:bridge`, `test:python`, `test:e2e` and `start:automation`.
It carries `FFMPEG_PATH` and `FFPROBE_PATH` pointing at an FFmpeg/ffprobe build with libass; without
it, every subtitle-burn render fails in a way that looks like a code bug. Never print its contents.

In a worktree, symlink `.env.local` and `.venv` from the main checkout rather than recreating them.

### Publishing build config

The desktop Facebook publishing config is baked in at build time, not read from a user's
environment. `scripts/generate-publishing-config.mjs` writes the gitignored
`app/electron/features/publishing/config.generated.ts` from `REUPMATIC_META_APP_ID` and
`REUPMATIC_META_BROKER_URL`; `pnpm install` (via `prepare`), `pnpm run build`, `pnpm run typecheck`
and `pnpm run test:bridge` all regenerate it first. A checkout with neither variable ends up with
`null` and falls back to the environment at runtime, so local dev can still set them in `.env.local`.

A release reads `META_APP_ID` and `META_BROKER_URL` from the repository's `release` environment
variables and passes them to `pnpm run build`; `META_APP_SECRET` belongs only to the `web/` broker
(Vercel) and never ships in the desktop build. Without the two values a packaged app reports
`PUBLISHING_NOT_CONFIGURED` rather than guessing.


## Testing

```sh
pnpm run test:core     # project, Library, preferences, safe saves and the SQLite queue
pnpm run test:bridge   # Library/project/batch -> Python/FFmpeg and model configuration
pnpm test              # core, bridge and Python suites
pnpm run test:e2e      # builds and launches Editor, batch and folder scenarios
pnpm run test:e2e:visual  # screenshot/visual passes; run locally, not in CI
pnpm run test:e2e:models  # real installed models: recognise -> translate -> export; opt-in
# Linux without a display: xvfb-run -a pnpm run test:e2e
```

`test:e2e:models` runs `tests/e2e/models/` against the staged `python/` interpreter and the local
models, copying the owner's `local-speech.json`, `local-models.json` and `local-translation.json`
into an isolated workspace (the same files the exploratory crawl reads). It skips itself, naming
what is missing, when the staged interpreter or those configuration files are absent, and it never
uploads or publishes.

The e2e launcher refuses every Douyin host from `fetch` and from each Electron session, so no test
reaches Douyin. Tests use synthetic local fixtures and isolated application data; only native
file-picker choices are controlled — media and render results are not mocked.

## Packaging a release

A signed release bundles the Python runtime and FFmpeg, so an end user installs nothing else. The
base Python payload carries the worker, faster-whisper and CTranslate2 translation only; the
Vision and VieNeu synthesis runtimes are **runtime packs** the user installs with the model that
needs them (see `docs/adr/0002-runtime-packs.md`).

```sh
pnpm run stage:python   # relocatable CPython + the base runtimes, under python/
pnpm run stage:packs    # per-platform vision/synthesis packs + the generated manifest
pnpm run stage:ffmpeg   # GPL ffmpeg/ffprobe, under ffmpeg/
pnpm run package:dir    # unpacked app under release/, for inspection
pnpm run package:mac    # or package:win
```

`stage:packs` builds for the host platform only (never cross-build), archives each pack under
`release/runtime-packs/` and writes the gitignored `app/core/speech/runtime-packs.json` the app
embeds. The release workflow sets `REUPMATIC_RELEASE_TAG` and `REUPMATIC_PACK_VERSION`, uploads
the archives to the same GitHub release, and on macOS signs every pack Mach-O with the release
Developer ID (`REUPMATIC_MACOS_SIGN_IDENTITY`) before archiving. Without a tag the manifest URLs
are placeholders; `pnpm dev` resolves packs from `python/runtime-packs/` instead, so no download is
needed locally.

macOS needs a Developer ID certificate plus notarization credentials; Windows a code-signing
certificate. `.github/workflows/release.yml` is a manual workflow that takes the version, the
optional pre-release flag and the platforms, then packages, signs and publishes to GitHub Releases.
`python/`, `ffmpeg/` and `release/` are gitignored build output.

## CI

`.github/workflows/ci.yml` runs three jobs on push and pull request: desktop source on
Linux/Windows/macOS (compile, lint, typecheck, build, core tests), native media on Linux (Ruff,
Python and bridge tests), and the marketing site build. Source jobs do not sign installers.

The Electron UI integration suite is slow, so it lives in `.github/workflows/e2e.yml` and runs on a
nightly schedule or on demand (`workflow_dispatch`) rather than blocking every push. Linux UI tests
do not certify macOS/Windows installers or native pixel parity.

Dependency update PRs are requested weekly by `.github/dependabot.yml` (npm, pip and GitHub Actions)
with patches/minors grouped and no auto-merge. Review the changelog, engines, peers and licences,
commit the real lock, and run CI.
