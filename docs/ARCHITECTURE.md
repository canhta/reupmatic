# Architecture

Reupmatic is a local-first desktop app. Media and model execution stay on the user's machine; the
renderer never touches the filesystem directly.

## Stack

| Layer | Choice |
| --- | --- |
| Desktop shell | Electron — window lifecycle, secure IPC, dialogs, worker supervision |
| UI | React + TypeScript + Vite, Astryx design system, i18next (English/Vietnamese) |
| Editing | `@xzdarcy/react-timeline-editor` for the timeline, `wavesurfer.js` for waveforms |
| Subtitle preview | JASSUB browser preview; FFmpeg/libass is the authoritative renderer |
| Media execution | Native FFmpeg/ffprobe (libass) driven by a Python worker |
| AI execution | Python worker with ONNX Runtime + OpenCV/NumPy, one model adapter per task |
| Local persistence | SQLite in WAL mode, one current schema per store, under Electron user data |
| Packaging | electron-builder / electron-updater, signed per-OS releases |

## Process boundaries

```text
React UI (renderer)
        |  validated, narrow Electron IPC
Electron main process: lifecycle, trusted file access, worker supervision
        |  NDJSON framed messages over inherited pipes
Python worker: FFmpeg, OCR/vision, speech recognition, synthesis, translation
```

The renderer holds no filesystem or Node access. The main process owns native pickers, grants and
the worker child. Long inference and rendering never run inline in the UI or main process; work is
admitted to one shared execution queue and progress travels as structured events. Artifacts cross
boundaries by reference, never as inlined media.

## Source ownership

Ownership is nested by runtime, then by business capability — never one directory mixing Python,
renderer code and filesystem access.

| Location | Owns |
| --- | --- |
| `app/core/` | Browser-safe business logic and contracts: library, projects, subtitles, batch, folders, automation, distribution (including the publishing destination seam), speech, processing, vision, media, diagnostics |
| `app/electron/` | Host adapters: typed IPC, native pickers and grants, the `persist:douyin` session, media protocols, CSP, window chrome, the diagnostic log sink, the publishing OAuth window and safeStorage credential store |
| `app/ui/` | Renderer features by capability, the shell (navigation, status, notification centre), locale catalogues and the Astryx design system |
| `worker/` | The Python worker: protocol/runtime, FFmpeg media operations, subtitle serialization, processing orchestration, vision and speech adapters |
| `scripts/` | Build and staging only: the base CPython (`package-python.mjs`), the per-platform runtime packs (`package-runtime-packs.mjs`) and FFmpeg |
| `contracts/` | One current cross-runtime schema per boundary, composed from tracked `*.source.schema.json` files |
| `web/` | The Next.js marketing site, a separate workspace package |

Each public capability exposes one small interface and keeps its store private. `app/core` must not
import React, React DOM or Electron. Host modules translate a seam (IPC, NDJSON, SQLite, a native
API) — core policy is not an adapter.

The base Python bundle carries only the worker, faster-whisper and CTranslate2 translation. Vision
(RapidOCR/OpenCV) and VieNeu synthesis are **runtime packs** the user installs with a model that
needs them: the host installs a pack into `userData/runtime-packs/<name>/<version>` and appends the
directory to the worker's import path. Pack contents, signing and the install lifecycle are
ADR-0002; the generated manifest is build output under `app/core/speech/runtime-packs.json`.

## Invariants

- **One current schema.** Project, text-layer and store formats carry a single shape with no version
  field. Unsupported or incomplete data fails loudly; there are no migrations, dual readers or
  aliases.
- **No silent fallback.** The app never switches to a hosted or paid engine because a local one is
  weak, and a missing runtime or model is reported rather than substituted.
- **Errors are explicit.** Failures surface as error codes with user-facing copy from the locale
  catalogues; a caught error maps to at least one diagnostic record.
- **Secrets stay out of files.** Credentials reach a child only through its environment, are stored
  with OS-backed encryption, and are scrubbed at one redaction choke point before any log line. The
  hosted synthesis credential is the same OS-encrypted BYOK store and child-env delivery as
  recognition.
- **Cloned voices are user data, not model data.** A local clone's speaker payload lives in the
  app's user-data voice store, never inside a hash-verified model bundle; cloud voices stay with the
  provider. A clone is only created from a user-picked clip behind a persisted rights attestation.
  The Turbo clone encoder graphs are a separate optional catalogue entry installed through the
  explicit, hash-verified install flow; cloning is unavailable, never a silent download, until it is
  installed.
- **Localization is exact.** Vietnamese catalogues satisfy the exact English key surface by
  capability; duplicate keys are rejected at composition.

## Verification

`pnpm run check` (Biome) covers formatting, lint and import order; `pnpm run check:python` (Ruff)
covers first-party Python; `pnpm run typecheck` is the `tsc` gate. `pnpm run test:core` and
`pnpm run test:bridge` are authoritative for execution semantics, and `pnpm run test:e2e` drives the
packaged Electron app on Linux. Static checks cannot prove keyboard access or visual quality.
