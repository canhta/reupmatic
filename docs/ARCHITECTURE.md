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
| `app/electron/` | Host adapters: typed IPC, native pickers and grants, the `persist:douyin` session, media protocols, CSP, window chrome, the diagnostic log sink, the publishing OAuth window and the async safeStorage credential stores (a rotated OS key re-encrypts on read) |
| `app/ui/` | Renderer features by capability, the shell (navigation, status, notification centre), locale catalogues and the Astryx design system |
| `worker/` | The Python worker: protocol/runtime, FFmpeg media operations, subtitle serialization, processing orchestration, vision and speech adapters |
| `scripts/` | Build and staging only: the base CPython (`package-python.mjs`), the per-platform runtime packs (`package-runtime-packs.mjs`, with the sdists it compiles in `runtime-pack-source-builds.mjs`), FFmpeg (`package-ffmpeg.mjs`, pinned in `ffmpeg-builds.mjs`) and the release's GPL corresponding source (`stage-gpl-source.mjs`, listed in `gpl-sources.mjs`) |
| `contracts/` | One current cross-runtime schema per boundary, composed from tracked `*.source.schema.json` files |
| `web/` | The Next.js marketing site, a separate workspace package |

Each public capability exposes one small interface and keeps its store private. `app/core` must not
import React, React DOM or Electron. Host modules translate a seam (IPC, NDJSON, SQLite, a native
API) — core policy is not an adapter.

The renderer has one drawer frame: `app/ui/design-system/SidePanel.tsx`, built from Astryx `Layout`.
The editor regions, the detail drawers and Batch & jobs compose it; feature code does not hand-build
a drawer header, scroll area or footer. A tabbed workspace (Sources & Library, Automation, Channels
& Affiliate) is framed by `app/ui/shell/WorkspaceFrame.tsx`: its detail drawer mounts through
`WorkspaceDrawer` into the frame's end column, so it spans the full height beside the tab row and
shows only while its tab is active. Every drawer has the same three parts: the header (title,
header `actions` such as a list's Add or More, close), a body that holds only fields, details and lists (per-row actions go in the row's More
menu), and a footer that holds the actions, with one primary at the end and rare or destructive
actions in a More menu. Editor tab panels are tool inspectors and bend that rule as
`docs/design/panels.md` sets out: `features/editor/ToolDrawer.tsx` wraps SidePanel at small
density, adds header view tabs, and lets a view fill the header actions and the footer from where
its state lives (`DrawerActions`, `DrawerFooter`). `design-system/Panel.tsx` and
`design-system/PanelControls.tsx` own the app-wide panel kit (sections, rows, pairs, read-only
values, status, command footer, page width, colour and position controls, path rows, and the
filter and selection bars above a list) that every drawer and options form composes.

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
- **A voice line fits its caption by speed, up to 1.2×.** A line longer than its output slot — cue
  start to the next cue's start, divided by the edit speed, since the export speeds the picture but
  not the voice — is sped to exactly fill it, never faster, up to `MAX_VOICE_SPEED` in
  `core/speech/synthesis/timing.ts`; only a line that still overruns at the cap is a conflict the
  user shortens. The cap is ElevenLabs' supported ceiling
  ([speed control](https://elevenlabs.io/docs/eleven-agents/customization/voice/speed-control):
  0.7–1.2) under Dubbing Studio's default of fitting speech to a fixed clip
  ([Dubbing Studio](https://elevenlabs.io/docs/eleven-creative/products/dubbing/dubbing-studio));
  it is far below where time-compressed tonal speech loses intelligibility (Mandarin sentences hold
  to ~16.7 syllables/s, [PubMed 30732921](https://pubmed.ncbi.nlm.nih.gov/30732921/)). The plan
  persists each line's speed and the edit speed it was fitted at; changing the edit speed refits
  every line in the same edit (`withVoiceAtExportSpeed`), and a project or render whose plan was
  fitted at another speed is refused. The export applies each line's speed with FFmpeg `atempo`,
  and the live monitor with the matching pitch-preserving stretch in `core/editing/voice-tempo.ts`.
  The draft's review player plays the same timing (`core/speech/synthesis/timed-voice.ts`): each
  line at its planned speed on its cue's output time, from the first cue on, rendered to a WAV in
  the renderer; the saved WAV stays the raw recording the receipt hashes.
- **Speed never changes pitch in the monitor.** The source element plays a clip's speed with
  `preservesPitch`, as `atempo` does in the export — a single video's `editing.speed`, a
  composition clip's own speed times it (`previewElementRate`). Web Audio's `playbackRate` always
  shifts pitch, so the live mix folds a line's speed and the playback rate into one stretch
  (`liveClipPlay`), cached for the current rate only (`stretchCache`), and plays it at 1×.
- **The monitor mixes on the export's output clock.** Trim and Speed apply to the source the
  timeline shows — a single video, or a composition's assembled timeline, which the export trims
  and speeds as one source. The timeline, cues and captions stay in that source time, as the export
  burns captions before it changes the clock. Music and voice are placed on the output clock the
  export uses — `(source − trim start) / speed` (`liveOutputClock`, `liveMixClockMs` in
  `core/editing/live-mix.ts`) — so voice lines start on their cue's frame, and music plays at 1×
  from its output offset. With the element at the edit's speed that clock runs at 1×; the timeline
  draws the music lane on the source frames it plays under (`soundtrackSourceSpan`).
- **The trim cuts voice, never moves it.** A line wholly outside the output is dropped; one
  straddling the trim start or the output end plays only its part inside, cut at the edit
  (`voiceLineSpan` in `core/editing/live-mix.ts`, `_voice_line_span` in
  `worker/media/audio/mixing.py`). Editors cut audio at an edit rather than drop or shift it
  ([CapCut split](https://www.capcut.com/resource/split-video-into-parts): "splitting a video will
  also divide the audio track at the same point"); a dropped line is never counted as long.
- **Localization is exact.** Vietnamese catalogues satisfy the exact English key surface by
  capability; duplicate keys are rejected at composition.

## Verification

`pnpm run check` (Biome) covers formatting, lint and import order; `pnpm run check:python` (Ruff)
covers first-party Python; `pnpm run typecheck` is the `tsc` gate. `pnpm run test:core` and
`pnpm run test:bridge` are authoritative for execution semantics, and `pnpm run test:e2e` drives the
packaged Electron app on Linux. Static checks cannot prove keyboard access or visual quality.
