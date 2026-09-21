# Contributing to Reupmatic

## Toolchain

Use the Node line in `.nvmrc` (24 LTS), a Python virtual environment (3.14 target; the worker
source accepts 3.12+), and native FFmpeg/ffprobe built with libass. The repo is pnpm-managed —
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
```

Individual files are `worker/requirements-{speech,synthesis,translation,vision}.txt`. A model
downloaded from the app still cannot run until its domain runtime is present; the matching
Settings row reports the missing runtime.

### Wire contracts

Run `pnpm run contracts:generate` before anything that talks to the worker. It composes the
gitignored schemas under `contracts/` from the tracked `*.source.schema.json` files and generates
`worker/runtime/operations.py`, which `worker/runtime/worker.py` imports directly. Without it the
worker exits on import and reports `WORKER_EXITED`. `test:core`, `test:bridge`, `test:python` and
`test` each run it first; `pnpm run dev` does not.

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

## Testing

```sh
pnpm run test:core     # project, Library, preferences, safe saves and the SQLite queue
pnpm run test:bridge   # Library/project/batch -> Python/FFmpeg and model configuration
pnpm test              # core, bridge and Python suites
pnpm run test:e2e      # builds and launches Editor, batch and folder scenarios
# Linux without a display: xvfb-run -a pnpm run test:e2e
```

The e2e launcher refuses every Douyin host from `fetch` and from each Electron session, so no test
reaches Douyin. Tests use synthetic local fixtures and isolated application data; only native
file-picker choices are controlled — media and render results are not mocked.

## Packaging a release

A signed release bundles the Python runtime and FFmpeg, so an end user installs nothing else.

```sh
pnpm run stage:python   # a relocatable interpreter with the runtimes, under python/
pnpm run stage:ffmpeg   # GPL ffmpeg/ffprobe, under ffmpeg/
pnpm run package:dir    # unpacked app under release/, for inspection
pnpm run package:mac    # or package:win
```

macOS needs a Developer ID certificate plus notarization credentials; Windows a code-signing
certificate. `.github/workflows/release.yml` is a manual workflow that takes the version, the
optional pre-release flag and the platforms, then packages, signs and publishes to GitHub Releases.
`python/`, `ffmpeg/` and `release/` are gitignored build output.

## CI

`.github/workflows/ci.yml` runs three jobs: desktop source on Linux/Windows/macOS (compile, lint,
typecheck, build, core tests), native media on Linux (Ruff, Python and bridge tests), and Electron
UI integration on Linux under `xvfb`. Source jobs do not sign installers, and Linux UI tests do not
certify macOS/Windows installers or native pixel parity.

Dependency update PRs are requested weekly by `.github/dependabot.yml` (npm, pip and GitHub Actions)
with patches/minors grouped and no auto-merge. Review the changelog, engines, peers and licences,
commit the real lock, and run CI.
