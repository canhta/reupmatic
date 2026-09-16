# Reupmatic — Architecture & Technology Stack

> Version: 0.2 · Research date: 2026-09-15 · Documentation: English.
> Status: D-40–D-41 confirm the technology/delivery direction; named component selections below are **PROPOSED integration targets**, not production-validated.
> Integrated into package v1.8. This supersedes the separate architecture v0.1 draft. It does not approve open commercial or execution policies.
> Evidence: prior baseline research plus the dated [reuse audit](research/reuse-audit.md). Eight small native FFmpeg/libass checks passed; no complete Editor, packaged desktop, model, connector, or performance benchmark was executed.

## 1. Concrete recommendation

**Electron + React + TypeScript for the application; native FFmpeg for rendering; Python model workers with ONNX Runtime/OpenCV; a shared TypeScript execution core; SQLite locally; Fastify/PostgreSQL for the paid-service backend.**

No first-party Rust engine and no Rust rewrite roadmap. Python is the production worker, not a temporary implementation. Reuse components before building equivalents; optimize model reuse, caching, bounded concurrency, and native calls in this stack. Exact package versions require compatibility tests, and models remain replaceable behind task adapters. D-40 does not turn every choice below into an approved dependency.

| Layer | Proposed selection | Responsibility |
|---|---|---|
| Desktop shell | Electron | Windows/macOS lifecycle, windows/tray, secure IPC, dialogs and worker supervision. [S01–02] |
| Application UI | React + TypeScript + Vite; Tailwind CSS/shadcn components | Five screen areas, inspector, real subtitle-content editing, batch and workflow configuration. These are project implementation choices, not a purchased editor. |
| Editing interaction | First integration target: `@xzdarcy/react-timeline-editor` + React controls; `wavesurfer.js` for waveforms/regions | Reuse timeline interaction instead of drawing a new widget. Bind component events to project edits. This is not a complete NLE; multi-clip media semantics, command history, and full tool behavior still need integration tests. [RU01–02] |
| Subtitle workspace and preview | `pysubs2` in Python; JASSUB browser ASS preview; FFmpeg/libass authoritative rendering | Reuse format conversion, retiming, and text layout. Build the product-specific cue editing table/bindings, not a new subtitle parser or font renderer. JASSUB is a renderer, not an editing UI. Audit bundled dependencies/fonts, not only wrapper license. [RU03–04] |
| Media preview input | Mediabunny/WebCodecs; FFmpeg-generated proxies when needed | Decode/seek supported inputs and supply frames/audio for quick preview. Probe actual codec support; never equate a container name with decodability. [S05] |
| Authoritative render | Native FFmpeg + ffprobe + libass | Probe/transcode, compile edits, mix audio, render subtitles and produce sample/full outputs. Not ffmpeg.wasm as the production render engine. [S06–08] |
| AI/CV execution | Packaged Python worker; ONNX Runtime + OpenCV/NumPy; PyAV only where frame/packet access is needed | OCR/mask/inpainting/TTS adapters and native preprocessing. Use FFmpeg CLI for operations it already handles; do not recreate demuxing/encoding in Python. Reuse audited VSE/VSR modules selectively rather than carrying their whole GUI/model dependency set. [S09–16, RU05–08] |
| Local execution | Shared TypeScript runner in an Electron utility process; SQLite persisted jobs | Step dependencies, scheduling, cancellation, recovery, result validity and policy checks. Renderer state and in-memory timers are never the durable queue. [S01, S19] |
| Folder intake | Chokidar + startup/resume reconciliation scan | Observe changes; apply application-owned file-readiness, identity and loop-prevention rules. File events alone do not prove a complete/new video. [S17] |
| Douyin intake | Playwright + separate Chromium profile, inside a connector process | Authorized discovery/download, headless operation where verified, visible login/verification where needed. Reuse the connector for manual and automated intake. [S18] |
| Local persistence | SQLite, WAL mode; integration 0.4 uses `node:sqlite` for the delivered batch journal; broader persistence remains proposed; files outside DB | Library/project/workflow/job/post metadata and transactional state under one current schema. Greenfield builds reject unsupported schemas instead of migrating them. Worker processes report results; they do not all write the DB independently. WAL must remain on local storage. [S19] |
| Online application API | Fastify + TypeScript | Entitlements, estimates/reservations, paid-operation journal, provider adapters and result reconciliation. Same language as the orchestration core. [S20] |
| Account and server data | Supabase Auth + managed PostgreSQL | App identity; authoritative entitlement/credit records and external-operation state. Only trusted backend code mutates balances. Supabase is a managed-service recommendation, not a business-policy decision. [S21–22] |
| Later cloud execution | Same TypeScript runner, BullMQ + Redis, Docker workers, S3-compatible object storage | Distributed delivery and CPU/GPU workers after cloud execution is introduced. No Redis, Docker or database server required on users' desktops. BullMQ delivery does not guarantee exactly-once external effects. [S23] |
| Localization | i18next + react-i18next, checked-in English/Vietnamese resources | All UI states, dialogs, validation and accessibility labels; content languages and schedules stay independent. [S24] |
| Packaging and tests | electron-builder/electron-updater; packaged Python/native dependencies; Vitest, pytest and Playwright | Per-OS signed releases, contract/UI/worker tests and installed-application tests. Signing/updates require actual platform validation. [S25] |

Exact dependency releases must be pinned together after compatibility tests; this document does not invent a tested lockfile. Timeline v1.0.0 is an inspected trial tag, not an installed-package result. WaveSurfer main was a beta during the audit, so use a verified stable release for the trial rather than blindly following main. RU identifiers are defined in [research/reuse-audit.md](research/reuse-audit.md).

## 2. Execution boundaries

```text
React UI / timeline / subtitle editor
                 |
       validated, narrow Electron IPC
                 |
Electron main process: lifecycle, trusted file access, worker supervision
                 |
Local coordinator: shared TypeScript execution core + SQLite
     |                  |                  |                  |
Native FFmpeg      Python AI worker    Native model       Source/publish
and ffprobe        ORT + OpenCV        executables        connector processes
                                        |                   |
                                  whisper.cpp /       Playwright browser
                                    llama.cpp         or approved APIs
                 |
         Explicit paid requests only
                 |
Fastify backend -> Supabase Auth / PostgreSQL -> selected AI providers
                 |
        Later, not a desktop prerequisite:
BullMQ/Redis -> cloud host of the same execution core -> CPU/GPU workers
```

Electron UI/main processes must not perform long inference or rendering inline. Use structured messages and progress events; send artifact references, not entire videos as base64 JSON. Python workers communicate through versioned, framed JSON messages over inherited pipes. If a native model server needs loopback HTTP, bind only to loopback, authenticate requests, restrict access and supervise its lifetime.

An Editor operation, batch item and automatic run compile into the same processing-step contracts. They differ in trigger, scope and permission—not in effect semantics. A profile is an optional serialization of reusable settings; it is neither an execution engine nor a required entry step.

Local and cloud stores have different authority: local media/projects remain local unless explicitly transferred; the backend owns credit accounting. A later cloud-run record has one authoritative executor/lease and is mirrored to desktop views. Do not implement independent calendars or concurrent local/cloud dispatchers for the same publishing occurrence.

## 3. Editor and preview: what must actually be built

**FFmpeg is not an editing UI, and a timeline widget is not a complete editor.** Reuse timeline/waveform mechanics, subtitle I/O, and rendering. First-party work is the binding to our project, editable cue table, commands/undo, selection synchronization, AI result protection, and five-area workflows. Preserve all approved text/timing/split/merge/rule/style and video/audio capabilities. Do not solve integration gaps by cutting tools.

Product project data stores clip source ranges, positions, track relationships, time mapping, transforms, audio changes, subtitle cues/styles, and references to generated artifacts; adapt library data rather than making its internal state the whole product database. Editing commands drive undo/redo. Keep display subtitle text, source OCR/STT, translation and spoken text separate, as required by the existing Editor spec.

A thin render adapter maps approved project edits to existing worker operations and FFmpeg filters. Reuse upstream helpers where compatible; do not invent a general-purpose media language or compositor framework. Every approved tool needs a mapping. A missing mapping is an integration gap, not permission to remove that tool.

| Preview mode | Proposed implementation | Honesty requirement |
|---|---|---|
| Quick interactive | Reuse browser media playback and library components; use Mediabunny/WebCodecs and PixiJS where multi-clip/frame compositing requires them. JASSUB renders the subtitle track; WaveSurfer supplies waveform/regions, not audio effects. Playback follows one project time map. | Identify proxy/approximate appearance. Sharing the libass family via JASSUB reduces duplicated text-rendering work but does not establish pixel/color/font parity. Unsupported codecs use verified proxies rather than failing silently. |
| Processed sample | Submit the selected interval, required context and current plan to the same native media/AI worker path as final output. | Same model/version, mask policy, effect order and intended quality; never present an omitted heavy effect as processed. |
| Full output | Execute the full plan against the intended source quality. | Do not reuse reduced-quality preview cache as final output. Validate boundaries and audio/subtitle timing. |

Cache keys include input identity/version, processing-plan hash, model/runtime version, relevant interval/context and output quality. Retain valid upstream artifacts. Cancel superseded queued previews and reject stale results. Editing subtitle style must not trigger new OCR or TTS; editing spoken text invalidates the affected speech/alignment dependencies.

Use the same subtitle serializer, font files and libass rendering configuration for authoritative sample/full rendering. SRT remains an interchange format; it does not carry the complete styled project. Carry styles and reusable processing settings in versioned project/profile data. **JSON + JSON Schema is the proposed interchange choice**, not XML merely because it was mentioned as an example. Final schemas belong in `contracts/`.

## 4. First model bindings to implement and evaluate

These are **specific proposed prototype bindings**, not benchmark winners. This reuse pass rechecked RapidOCR/LaMa and supporting pipelines; the earlier Whisper/Qwen/VieNeu bindings are carried forward as candidates, not newly tested or re-certified.

| Capability | Initial binding | Required qualification |
|---|---|---|
| OCR/text detection | RapidOCR + appropriate PaddleOCR-derived ONNX detector/recognizer | Select recognition models/dictionaries by required language. The reviewed PaddleOCR table lists Vietnamese under PP-OCRv3; do not assume its default PP-OCRv5 recognizer supports Vietnamese. Test Chinese, English and Vietnamese separately. [S10–11] |
| Mask construction | OpenCV preprocessing/morphology and time-aware grouping/tracking; direct masks for manual fixed regions | Subtitle-purpose discrimination and non-text logo detection are distinct. A general non-text-watermark detector remains a concrete unresolved binding; OCR boxes cannot stand in for it. |
| Image-region reconstruction | `Carve/LaMa-ONNX` → `lama_fp32.onnx` via ONNX Runtime | Publisher recommends this export and documents fixed 512×512 input/opset 17. Test region-plus-context processing, geometry, conversion parity and video flicker. Upstream LaMa uses image+mask inputs, not a video temporal-consistency contract. [S12–13] |
| Speech recognition | `whisper.cpp` + multilingual Whisper `small` as the first measurement baseline | Not the `.en` model. Evaluate higher/lower model sizes against accuracy and device memory. Native acceleration is model/build/device-specific. [S14] |
| Translation and category/tag mapping | `llama.cpp` + `Qwen/Qwen3-4B-GGUF`, Q4_K_M | Validate Chinese/English→Vietnamese, Vietnamese/English text, names and taxonomy assignment. Constrain output to the required schema; do not give this model workflow tools or publishing authority. A multilingual model card is not a quality benchmark for this product. [S15] |
| Local Vietnamese/English TTS | `pnnbao-ump/VieNeu-TTS-v3-Turbo` through its Python SDK, explicitly selecting ONNX/CPU and FP32 for initial tests | Model card declares vi/en and Apache-2.0; upstream documents torch-free ONNX execution. Pin SDK/model/voice assets: retrieved documentation differs on default precision and preset counts. Do not inherit changing defaults or report vendor speed claims as our results. [S16] |
| Alignment | First-party segment/time-mapping logic + measured audio durations and FFmpeg audio operations | Start with source cue timing, generated speech length, bounded speed changes and gaps. Fine word alignment needs a separately validated binding if required. No lip-sync claim. |
| Premium AI | Backend-owned capability adapters | Provider selection, model IDs, availability, pricing and commercial rights still require task-specific verification. No user-facing AI BYOK branch and no provider master key shipped in the desktop. |

A model can be replaced without changing Editor, batch, or Automation contracts. ONNX is a representation; ONNX Runtime executes compatible graphs. It is not a universal runtime requirement for every AI task. LaMa inpainting and `llama.cpp` LLM inference are unrelated components despite similar names.

### Hardware direction

CPU execution is the baseline to test, not a universal performance guarantee. Test native/ORT acceleration separately on Apple Silicon and Windows targets; retain Mac Intel in the support investigation rather than silently excluding it. CoreML only covers supported graph operations; availability of an execution provider is not proof of complete model offload. [S09]

Load components on demand. A model manager must pin/check artifacts and offer only validated combinations. Do not load every large model simultaneously, require user-installed Python/Conda/Docker, or silently fall back to a paid service.

## 5. Automation, persistence and paid operations

The shared TypeScript runner owns dependencies, conditional routing, input/output validation, configuration snapshots, retries and artifact validity. SQLite stores due times and accepted work locally. Timers merely wake the runner; startup/resume reconciles durable state. Chokidar events require readiness checks and periodic/resume reconciliation, particularly for large copies, renames and disconnected folders. [S17, S19]

Download-only jobs do not load AI; processing-only jobs do not require publishing credentials. Persist destination-post identity, selected channel/links and workflow occurrence before external submission. Unknown outcomes require reconciliation before resend. Queues do not eliminate duplicate-effect risks.

Fastify performs online authorization and reserves/settles credits transactionally in PostgreSQL. It stores provider-operation identity before dispatch and uses a recoverable backend dispatcher. HTTP-request lifetime is not the lifetime of a paid operation. Worker transport, timeout, settlement and customer refund policy must remain distinct. [S20–22]

The later BullMQ layer adds distributed delivery, not a second implementation of workflow rules. Retain the same task schemas and TypeScript runner; adapt state/artifact stores and execution ownership. The desktop does not need Redis. [S23]

Business choices in `specs/execution-policy.md` remain proposed where marked there. This architecture does not approve offline grace periods, credit rates, refund rules, expiry handling, or public-action defaults.

## 6. Security, integration and distribution

Use Electron context isolation, sandboxed renderers, no renderer Node integration, sender-validated narrow IPC and restricted navigation. Do not load Douyin pages in the trusted application renderer. Keep source browser profiles local, access-restricted and outside project/profile exports. Managed tokens use OS-protected storage; no secrets in logs. Browser profiles can contain more than cookies and require their own storage/deletion policy. [S02, S18]

YouTube/Facebook use authorized publishing adapters, not Playwright-driven posting as the default. YouTube's official upload endpoint was reviewed; Meta's targeted documentation page could not be fetched in this pass. Exact scopes, app review, scheduling, link placement and live behavior remain R-02. Neither OAuth success nor upload acceptance proves public publication. [S26]

Build and test Windows/macOS packages separately, including native libraries and Python components. Pin manifests/checksums and preserve license notices. Updates must not interrupt active work outside the approved lifecycle policy. Electron updater support is documented; installed/signing/recovery behavior is untested. [S25]

Review the actual FFmpeg binary configuration and bundled codecs: LGPL/GPL/nonfree build choices matter; a subprocess boundary does not erase redistribution obligations. Audit model weights, conversions, fonts, voices and transitive runtimes separately. LaMa's upstream code/export metadata is not a substitute for provenance review of the exact weight artifact. [S07, S12–13]

## 7. Alternatives and why they are not the baseline

| Alternative | Decision rationale |
|---|---|
| Reopen shell/language selection | Not on the delivery path. D-40 accepts Electron/React/TypeScript and Python/native workers and excludes first-party Rust. |
| Fork a complete web/desktop editor by default | Not automatically the fastest path. OpenVideo/Twick have license questions for this product; VSE/VSR bring GUI/model dependencies. Prefer package adapters or carefully scoped reuse. A commercial SDK can be considered under approved terms, but no purchase or contract is assumed. [RU06–11] |
| PyTorch for every desktop model | Keep it available for a model that justifies it, but do not require it for the proposed ONNX/native paths. Prototype evidence and distribution size determine additions. |
| FastAPI as the primary application backend | Technically viable. Fastify keeps application policy and shared execution logic in TypeScript, leaving Python focused on inference; avoid duplicate workflow semantics across languages. |
| Redis/Celery/Temporal on every user's desktop | Not the baseline. Persist local work in SQLite; distributed infrastructure belongs to the later server deployment. Avoid installing an external service merely to run a folder workflow. |
| AI-agent framework to orchestrate workflow | Not required. AI extracts/transforms data; deterministic application code controls schedules, budgets, destinations and external actions. |

## 8. Validation gates before production commitment

| Gate | Evidence to collect | Related existing research IDs |
|---|---|---|
| A — Editor/render parity | Approved video/audio operations, editable Vietnamese subtitle cues, seeking/time mapping, quick vs authoritative sample, full export, stale preview rejection and live batch contention on target devices. | R-05, R-07, R-08, R-12 |
| B — Local AI chain | Purpose-aware OCR, language-specific models, manual/automatic masks, LaMa temporal quality, STT/translation/TTS/alignment, memory/latency and exact artifact licenses. Include a video with no text, one with moving text, and one with dense Vietnamese diacritics. | R-03–06, R-09 |
| C — Durable execution | Folder readiness, deduplication, crash/restart, run ownership, permission/credit gates, schedule recovery and simulated unknown external results. No duplicate link counts or destination posts. | R-10, R-11, R-13, R-15 |
| D — Distribution and live integrations | Signed packages, native/AI dependencies, interrupted model installation/update; authorized Douyin intake and platform post/readback tests. | R-01, R-02, R-05, R-14 |

Passing a UI demonstration does not pass these gates. Failure of one model binding does not invalidate the entire technology stack. A failed media architecture gate must be addressed before building dependent Editor tools—not hidden by narrowing scope.

## 9. Evidence register

S01–S26 preserve the earlier v0.1 research register dated **2026-09-15**; they were not all re-reviewed in this pass. New source checks and version caveats are RU01–RU13 in [research/reuse-audit.md](research/reuse-audit.md). Sources describe capabilities, not integration tests. The source tree, package artifact, transitive dependencies, and exact model weights must be pinned together before shipping.

| ID | Primary source | What it supports |
|---|---|---|
| S01 | `https://www.electronjs.org/docs/latest/tutorial/process-model` | Main, renderer, preload and Node utility-process boundaries. |
| S02 | `https://www.electronjs.org/docs/latest/tutorial/security` | Isolation, sandboxing, narrow IPC and untrusted-content safeguards. |
| S03 | `https://v2.tauri.app/reference/webview-versions/` | Platform-specific Tauri webviews. |
| S04 | `https://pixijs.com/8.x/guides/getting-started/intro` | Interactive 2D rendering, WebGL/WebGPU, masks and filters. |
| S05 | `https://mediabunny.dev/guide/introduction` and `https://mediabunny.dev/guide/supported-formats-and-codecs` | Media I/O/decoding and dependence on available codecs. |
| S06 | `https://ffmpeg.org/ffmpeg-filters.html` | Media filter operations and subtitle rendering integration. |
| S07 | `https://ffmpeg.org/legal.html` | Binary-build-dependent licensing and redistribution considerations. |
| S08 | `https://github.com/libass/libass` | ASS/SSA rendering; not a subtitle-editing UI. |
| S09 | `https://onnxruntime.ai/docs/execution-providers/` and `https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html` | Runtime backends and CoreML limitations. |
| S10 | `https://github.com/RapidAI/RapidOCR` | OCR runtime integration, PaddleOCR-derived models and license statements. |
| S11 | `https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/pipeline_usage/OCR.html` | Model/language mapping; reviewed table does not justify assuming every version supports Vietnamese. |
| S12 | `https://github.com/advimman/lama` | Image/mask inpainting and upstream model provenance. |
| S13 | `https://huggingface.co/Carve/LaMa-ONNX` | FP32 export recommendation, fixed shape/opset and export-specific caveats. |
| S14 | `https://github.com/ggml-org/whisper.cpp` | Native Whisper execution and platform/backend paths. |
| S15 | `https://github.com/ggml-org/llama.cpp` and `https://huggingface.co/Qwen/Qwen3-4B-GGUF` | Native LLM execution and an official quantized multilingual model. |
| S16 | `https://github.com/pnnbao97/VieNeu-TTS` and `https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo/blob/main/README.md` | ONNX CPU path, Vietnamese/English model and package licensing statements; defaults differ between retrieved documents. |
| S17 | `https://github.com/paulmillr/chokidar` | Folder observation, write-stability options and event behavior. |
| S18 | `https://playwright.dev/docs/api/class-browsertype` | Browser launch and persistent contexts, not verified Douyin access. |
| S19 | `https://sqlite.org/wal.html` | Local WAL persistence, concurrency and same-host constraint. |
| S20 | `https://fastify.dev/docs/latest/` | Node application backend framework. |
| S21 | `https://supabase.com/docs/guides/auth` | Managed application authentication. |
| S22 | `https://www.postgresql.org/docs/current/tutorial-transactions.html` | Transactional server records; accounting schema is project work. |
| S23 | `https://docs.bullmq.io/` | Redis-based distributed jobs; worst-case redelivery. |
| S24 | `https://react.i18next.com/` | React localization resources and locale-aware rendering. |
| S25 | `https://www.electron.build/docs/features/auto-update/` | Desktop packaging/update integration and signing requirements. |
| S26 | `https://developers.google.com/youtube/v3/docs/videos/insert` | Authorized video upload; not universal publishing/scheduling rights. |

**Next engineering deliverable:** the bounded integration exercise in the reuse audit: actual timeline + cue editing + sample render + same worker in a small batch. Define only the required versioned UI/worker messages and artifact references before this exercise; expand `contracts/` and `BUILD_PLAN.md` from verified integration. The eight native-media checks do not replace it. Do not add new runtime languages or reduce Editor features.

## 10. Evidence completed in v1.8

[Native-media results](research/media-smoke/results.json): 8/8 checks passed in Linux using Python 3.13.5 and the installed FFmpeg 7.1.5/libass. A 12-second synthetic 320×180 video produced a 4-second sample; its 120 decoded frames matched the same interval of the full lossless output. Vietnamese text survived SRT→ASS→SRT conversion; a programmatic subtitle text/timing change altered the sample; audio/video and the source file were preserved.

This does **not** test browser preview, interactive editing, pysubs2/PyAV, OCR/LaMa, GPU speed, target desktop packaging, variable-frame-rate inputs, or production export parity. No latency or delivery estimate is inferred. The system FFmpeg binary/fonts are not included in the package.

## 11. Integration addendum 0.1

The next exercise now has a source skeleton, [minimal contracts](contracts/README.md), and [BUILD_PLAN.md](BUILD_PLAN.md). The narrow Node/Python bridge and native-media checks are recorded in [integration results](research/integration/RESULTS.md). The Electron/React source is not installed/launched; UI-package compatibility, JASSUB assets and pysubs2 remain unverified in this environment. This does not promote named libraries or approve business policies.

Implemented exercise operations: native input registration/probe, SRT-backed sample/full render, cache integrity, bounded cancellation, peak generation and isolated developer batch items. pysubs2 adapters are supplied but untested. A minimal serial in-memory worker queue is an integration harness only; the proposed TypeScript/SQLite production coordinator, first-party workflow rules and recovery remain future INT-07 work. No custom timeline, subtitle parser, codec, compositor or Rust component is introduced.

## 11. Integration 0.2 maintenance and naming

Reupmatic is the product name (D-42). Electron/React/TypeScript and Python/native execution boundaries remain unchanged. Lefthook/Biome with `tsc`, plus Ruff for Python, are development tools; they add no product runtime or new Settings screens. CI/Dependabot use existing services rather than a new updater subsystem. See [CONTRIBUTING.md](CONTRIBUTING.md).

The [dependency audit](research/dependency-update.md) records current source-reviewed version targets, not an installed compatibility set. [Current results](research/integration-0.2/RESULTS.md) cover 41 passing / 1 skipped bounded local checks. UI-side render IDs and range-file responses have regression coverage, while actual Electron/component/target-OS gates remain open. A genuine lockfile, first formatter pass and target compiler build are still required. No first-party Rust or engine rewrite was added.

## Integration 0.3 — Implementation detail, not a new stack decision

The desktop and developer batch harness now share `RenderCoordinator` above `WorkerClient`. Cancellation spans subtitle preparation and native rendering; empty cues do not install or invoke a subtitle parser. This remains in-process and does not implement durable Automation.

A bounded JSON project contract persists the current single-video cue edits and sample interval. Native source selection/hash checking binds reloaded media; this does not replace the planned Library database or full project/profile schemas. Playwright Electron tests are supplied for real UI validation but have not run in this environment. Current evidence is in [integration-0.3](research/integration-0.3/RESULTS.md).

## Integration 0.4 — concrete journal binding

The manual batch slice uses built-in `node:sqlite` (conditionally imported) instead of adding the earlier proposed `better-sqlite3` dependency before owner setup. This is a narrow, reversible binding choice within the accepted TypeScript/SQLite boundary, not a stack change. Synchronous queries are bounded metadata operations; video work stays in the shared Python/native path. Packaged Electron support must pass its actual runtime gate; failure disables only batch and preserves the journal. SQLite stays on local disk with one host owner.

The intended full coordinator utility-process boundary, folder triggers and durable workflow scheduler remain unimplemented. Do not infer them from the new batch journal. Sources and limitations are recorded in [integration 0.4 evidence](research/integration-0.4/RESULTS.md).


## Integration 0.5 — Folder intake and local UI skill

`FolderMonitor`/`FolderStore` add native filesystem reconciliation and saved config/baseline/receipt state, not a second job executor. Chokidar 5.0.0 is the source-reviewed observation adapter; the existing `BatchQueue`/Python worker still execute every admitted video. Deterministic admission IDs recover a missing receipt without creating a new batch. Native picker authority, readiness checks and output exclusions are in [folder-intake.md](specs/folder-intake.md). The developer-only activation is not a production Plus authorization implementation.

[The local UI skill](.agents/skills/reupmatic-ui-design/SKILL.md) owns source-derived visual guidance and explicit desktop adaptations. Root AGENTS references it; common CSS tokens implement the current reversible visual direction. No additional runtime, Rust component, font binary or bespoke graphic engine is introduced. Full-app/Chokidar installation and visual/target-OS validation remain open; see [0.5 evidence](research/integration-0.5/RESULTS.md).
