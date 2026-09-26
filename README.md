<p align="center">
  <img src="public/brand/logo.svg" alt="Reupmatic" width="88" />
</p>

<h1 align="center">Reupmatic</h1>

<p align="center">
  <strong>Turn Douyin videos into ready-to-post videos — without uploading anything.</strong><br />
  Batch import, subtitle and translate, dub with local voices, clean up on-screen text, and export.
</p>

<p align="center">
  <a href="https://github.com/canhta/reupmatic/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/canhta/reupmatic/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" /></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg" />
</p>

---

Reupmatic is a desktop app for re-uploading Douyin content at scale. It keeps the whole pipeline on
your machine: a local library of originals, editable subtitle and translation layers, voice
synthesis in Vietnamese or English, OCR-based cleanup of burned-in text, and batch or
folder-watching jobs that run unattended. Nothing is sent to a server, and no paid API is required
to get a post out.

> **Alpha.** The app is usable end to end, but model quality and signed installers are still being
> validated. The current scope is described on [reupmatic.canhta.com](https://reupmatic.canhta.com).

## Why Reupmatic

- **Batch, not one-at-a-time.** Import a folder or a channel, queue the whole set, and let it run.
- **Local by default.** Video, audio and text never leave the device; models run on your CPU.
- **Text that ships translated.** Source transcript, translation, spoken text and displayed
  subtitles are separate editable tracks, not one overwritten caption file.
- **Cleanup built in.** OCR detects burned-in text and reconstructs the region behind it before
  export.
- **Your files stay yours.** Originals are referenced, never rewritten; outputs are explicit saves.

## Features

| | |
| --- | --- |
| **Intake** | Douyin links and channels, folder watching, local file import |
| **Editing** | Timeline, cue table with undo, subtitle styling, per-clip enable/disable |
| **Language** | Speech recognition, translation, and editable text layers in both locales |
| **Voice** | Local TTS with review-before-save; no cloud fallback |
| **Vision** | OCR read, subtitle removal and inpainting samples |
| **Export** | Sample or full render with authoritative FFmpeg/libass output |
| **Queue** | One durable job queue shared by Editor, batch and Automation |
| **Interface** | English and Vietnamese, light and dark |

## Install

Download the macOS `.dmg` or the Windows `.exe`/`.msi` from the
[Releases page](https://github.com/canhta/reupmatic/releases). The installer bundles its own Python
runtime and FFmpeg, so nothing else is required. Model weights are downloaded from Settings when you
choose a model, and updates install themselves from the release feed.

## Development

Node 24 LTS, Python 3.14 and an FFmpeg/ffprobe build with libass.

```sh
python -m venv .venv
node scripts/python.mjs -m pip install -r worker/requirements-dev.txt
# Optional local model runtimes (speech, synthesis, translation, vision):
node scripts/python.mjs -m pip install -r worker/requirements-optional.txt
pnpm install
pnpm run contracts:generate
pnpm run build
pnpm test
pnpm start
```

| Command | Purpose |
| --- | --- |
| `pnpm run dev` / `pnpm start` | Launch in development / from built output |
| `pnpm run check` / `pnpm run typecheck` | Biome validation / TypeScript checking |
| `pnpm run check:python` | Ruff validation for worker and scripts |
| `pnpm test` | Core, bridge and Python suites |
| `pnpm run test:e2e` | Electron scenarios (needs native prerequisites) |
| `pnpm run test:e2e:models` | Real-model Editor flow (opt-in; needs staged Python and models) |

Full setup, hooks, contracts and packaging live in [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md); the
stack and source layout are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The marketing site is the `web` package —
`pnpm --filter web dev`.

## Contributing

Issues and pull requests are welcome. Read [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) before opening one:
`pnpm run check`, `pnpm run check:python`, `pnpm run typecheck` and `pnpm test` must pass, and hooks
run a subset of that on commit and push.

## Licence

Apache-2.0 — see [LICENSE](LICENSE). Bundled FFmpeg is GPL; its licence, version and source offer are
recorded in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
