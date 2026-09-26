# Current integration contracts

> Status: implementation proposal for a bounded local exercise, not the full production data model.
> Based on Architecture §2–3 and reuse audit §6. These details do not approve billing, scheduling, storage retention, or public-action policy.

## Boundary and files

UI → allowlisted Electron IPC → TypeScript `WorkerClient` → Python stdio → native FFmpeg.
The same `RenderCoordinator` and `WorkerClient` are used by the desktop and batch exercise. No media bytes are encoded in JSON.

| File | Scope |
|---|---|
| [worker-request.schema.json](worker-request.schema.json) | Allowed methods and their request parameters. |
| [worker-event.schema.json](worker-event.schema.json) | Correlation, revision, progress/result/error envelope. Method-specific result fields follow §3. |
| [processing.schema.json](processing.schema.json) | Optional current local OCR/removal/editing/global-appearance recipe, version 1. |
| [cues.schema.json](cues.schema.json) | Edited display cues; not OCR evidence, translation, or spoken text. |

`worker-request.schema.json`, `processing.schema.json`, `cues.schema.json`, `project.schema.json`,
`batch-submit.schema.json`, `folder-create.schema.json` and `subtitles/text-layers.schema.json`
are composed, self-contained wire schemas: `npm run contracts:generate`
(`scripts/sync-contracts.py`) rewrites them from the domain schemas they embed on every run, so
they are gitignored, not committed, and a clean clone has none of them until generation runs.
Each has a tracked, hand-authored base document one directory entry over, at
`<name>` → `<name-without-.schema.json>.source.schema.json` (e.g. `cues.source.schema.json`,
`subtitles/text-layers.source.schema.json`); edit the `.source.schema.json` file, never the
generated one — the next `contracts:generate` overwrites it. See "Audio, appearance and schema
composition" below for the domain schemas that feed the embedding.

UTF-8, one JSON object per line, maximum request line 2 MiB. Messages use `v: 1`, unique session `id`, nonnegative integer `revision`, `method`, `params`. Unknown fields/methods are rejected. stdout is protocol-only. No shell command, FFmpeg arguments, URL, provider key, or output destination is accepted from the renderer.

Progress may be stage-only (`fraction: null`). Every accepted non-control operation eventually has one result or error while the worker remains connected. Worker termination is a transport failure, not completion. `cancel` has its own request ID and acknowledgement; the target operation reports its own terminal outcome. Duplicate request IDs are rejected, not treated as business-level idempotent retries.

## Identity, authority and time

Electron's native file picker authorizes a local input. Only the trusted host calls `asset.register` with an absolute path. The UI receives an asset ID/name and registry-only media URL. This is reference-first import: registering a video does not copy it. Worker registration records its initial SHA-256 and size/mtime; a detected source change requires re-registration. Library deduplication and immutable derived-asset SHA-256 references are implemented; the complete derivation graph remains future work.

The native output path is returned only to the trusted host. The renderer receives an artifact ID and registered media URL; saving uses a native save dialog. Generated work stays below the private workspace. No original is overwritten by rendering.

All cue times are **integer milliseconds**, not rounded UI seconds. Intervals are `start_ms, end_ms)`; end must exceed start. Source FPS, VFR mapping, frame-snapping and multi-clip time mapping are not defined by this exercise. Cues use stable edit IDs; duplicates are rejected, overlapping cues are not silently deleted. A subtitle document is display text only. Editing it never requests TTS, OCR or a paid service.

`revision` is an opaque caller edit generation echoed by the worker. It is not a checksum. The UI accepts a render only if both revision and latest request ID match. Changing locale does not advance an edit generation. Cache identity depends on input hashes, range, renderer revision, encoder settings and FFmpeg build identity—not on UI locale or request ID.

## Operations and minimal results

| Method | Parameters | Result / boundary |
|---|---|---|
| `hello` | Empty | Protocol version; actual availability of FFmpeg/pysubs2; OCR/inpainting report configured local availability, not verified inference; durable worker jobs remain false. |
| `asset.register` | Absolute `path`; `kind: video|audio|subtitle` | `asset_id`, basename, SHA-256, kind. Internal host command only. Subtitle import accepts UTF-8 SRT/ASS in this exercise. |
| `media.probe` | Registered video ID | Duration, width, height, has-audio. Missing/invalid input is a real failure. |
| `media.peaks` | Registered video ID | Up to 1,000 normalized peaks and duration, or empty peaks without audio. Native audio decoding; one-hour exercise limit, not a product limit. |
| `subtitles.load` | Registered SRT ID | Cue array, using pysubs2; no handwritten SRT parser fallback. |
| `subtitles.preview` | Cue array | ASS text serialized by pysubs2; no disk output, media render or inference. |
| `subtitles.save` | Cue array | Generated SRT asset ID, internal path, SHA-256 and ASS serialization. Does not modify the imported SRT. |
| `media.render` | Registered video and optional subtitle ID; encoding | Verified artifact ID/internal path/hash, duration/dimensions/audio and `cache_hit`. |
| `cancel` | Target `request_id` | `requested` boolean. Not a promise to undo an already committed output. |

`review` uses an MP4 integration preset; `lossless` uses FFV1/FLAC for correctness tests. They are not approved shipping codec choices or the complete export UI. Fonts and target-platform FFmpeg builds still need validation. Output-side trimming preserves subtitle timing but may decode earlier source frames; it is not a demonstrated low-latency seek strategy.

## Failure and lifecycle

The complete set of codes a worker "error" event may carry is canonical in `worker/runtime/errors.py`'s `KNOWN_CODES` and mirrored in `app/core/worker/error-codes.ts`'s `WORKER_ERROR_CODES`; `tests/native/worker-error-codes-contract.test.mjs` keeps the two lists in sync, and `tests/python/test_worker_error_codes.py` keeps `KNOWN_CODES` in sync with every `WorkerError(...)` call site. `WORKER_EXITED`, `WORKER_START_FAILED` and `INVALID_WORKER_RESPONSE` are TypeScript-only `RemoteError` codes for client-detected transport failures (process exit, spawn failure, a malformed or failed-validation reply) that never appear in `KNOWN_CODES`, since the worker process itself never raises them. UI explains codes in English/Vietnamese; raw source paths/FFmpeg diagnostics are not forwarded as friendly text.

One worker executes media jobs serially, with a bounded queue of 32 and session bookkeeping of 10,000 IDs. These are reversible safety bounds for this exercise, **not** package limits or production concurrency policy. Cancel remains responsive through an independent stdin reader. EOF requests cancellation and cleanup. The test process does not outlive its host intentionally.

Verified outputs have a cache manifest and content hash. Temporary outputs are not advertised as successful. A cache persists on disk; the accepted-job queue and input registry **do not** survive a restart. No SQLite job ledger, durable workflow engine, folder watcher or billing entitlement implementation is claimed.

## Checks and deliberate gaps

[Test matrix maps contracts to behavior tests. JSON Schema checks shape; runtime checks handle relationships (end > start, unique IDs, known asset, source change). TS/Python validators are intentionally small; schema parity needs tests whenever either side changes. This is not the final project/profile/workflow/post/API schema set.

## Reupmatic desktop correlation
The renderer preallocates a unique `request_id` before invoking `reupmatic:render`. The trusted host maps it to the worker's internal request ID; progress/result/error and the acknowledgement use the public ID. A terminal event may arrive before the acknowledgement on a cache hit. An acknowledgement cannot reset terminal state to queued; edits still invalidate acceptance by revision. Duplicated public IDs are rejected for the current session. The worker stdio protocol remains v1 and is unchanged. `media://local/<asset-id>` is registry-only and now returns bounded single byte ranges; no arbitrary path is accepted from the renderer.

## Render lifecycle and single-video project
`app/core/rendering/render-coordinator.ts` registers the public operation before any subtitle preparation. Progress is remapped for both preparation and FFmpeg steps. Cancellation marks the operation immediately and requests cancellation of its current worker ticket; even a late preparation result cannot launch FFmpeg. Exactly one public terminal outcome is emitted by this in-process coordinator; this is not an exactly-once external-action guarantee or a durable queue.

Empty display cues skip `subtitles.save`. A trusted batch caller may pass a previously registered SRT ID as a separate coordinator argument, mutually exclusive with edited cues; the renderer cannot inject that argument. Actual output/input limits remain in the worker. The public desktop render request still has the same fields and version.

[project.schema.json](project.schema.json) defines the bounded project file: `format`, `version`, original source path/hash and edited display cues. `.reupmatic.json` is UTF-8 JSON with a 2 MiB exercise safety limit. Reject unsupported versions and unknown fields; parse and validate completely before replacing UI state. Cross-field validation uses the shared cue validator and explicit time checks. Loading a file is never permission to execute instructions, download models, upload media or publish.

A native file picker authorizes the project, then a second native choice identifies the original video (the stored path is only a hint). Worker registration checks its hash against the project; a moved file with the same contents works. Invalid/mismatched input leaves the existing editor untouched. Project save takes an immutable snapshot and the caller revision. A successful save only clears dirty state if that edit revision is still current; edits made during the dialog remain unsaved.

Save uses a temporary file in the destination directory, file sync and rename without first deleting the destination. Same path, symlink and detectable hardlink references to protected originals are refused. No folder/retention policy, source deletion, autosave, undo-history persistence, saved render cache, multi-clip timeline or reusable profile is implemented by this contract. Directory fsync/power-loss guarantees and target-OS filesystem behavior need separate testing.

## Local manual batch
[Batch submit schema](batch-submit.schema.json) and [example](examples/batch-submit.json) describe the renderer admission request. Native picker results provide video/subtitle/output IDs; no renderer-supplied source path, destination path, shell argument, URL, provider or credit operation is admitted. Contracts live in `app/core/batch/batch-contracts.ts`; the allowlisted IPC verbs are defined in `app/electron/features/batch/ipc.ts` and preload. `BatchQueue` owns the current SQLite journal, restart reconciliation, and restoration of protected input paths; host and CLI callers supply the database path plus worker/render adapters without constructing the store.

`batch-enqueue` uses a stable `request_id` for idempotent admission. SQLite stores one immutable input snapshot per job. A retry retains the job ID, increases attempt at actual dispatch, and revalidates file hashes. The worker still has a volatile execution queue; durable batch state is host-owned and is not advertised as a new worker capability.

Snapshots contain monotonic per-host `version`, `paused`, active job ID, recovery count, fault code and public item state/name/attempt/output basename/progress. The UI subscribes before its first snapshot request and discards older versions. Native source paths and the DB are not part of that payload; a chosen output folder's display path is returned explicitly by its native picker.

`batch-pause`, `batch-resume`, `batch-cancel`, `batch-retry`, `batch-reveal`, `batch-snapshot` are separate verbs. Cancel acknowledgements are not terminal results. On restart, queue dispatch starts paused, Running becomes Interrupted and Cancelling becomes Cancelled. Completed jobs remain completed; partial/native encoding recovery is not promised. Full semantics and temporary resource bounds stay with the batch capability.

## Folder intake boundary
`folder-create.schema.json` describes a native-picker request, not a serialized workflow containing filesystem authority. `folder-pick-source` / `folder-pick-output` return `{directory_id,name}`; `folder-create` consumes two IDs plus explicit `include_existing` and `recursive` booleans. The host maps the IDs, validates canonical directories and loop constraints, and saves a paused rule.

`folder-snapshot`, `folder-start {rule_id}` and `folder-pause {rule_id}` return the `FolderSnapshot` shape from `app/core/folders/folder-contracts.ts`; `reupmatic:folders` broadcasts versioned snapshots. List rows expose selected folder names, state, count, scan time and actionable error codes—not arbitrary read/write capabilities. Rule creation/start is gated by the host; the UI cannot enable developer mode or assign itself Plus.

`FolderIntake` owns its current-format rule/receipt persistence and admits through `BatchQueue.admitFolder()` only. The Electron adapter supplies the database path and native watcher; it does not construct the store. Deterministic request IDs and existing batch records reconcile a missing intake receipt; rules/receipts are not another job executor. See the folder-intake contract for baseline and deduplication semantics. Internal `watch_*` IDs are reserved for trusted folder admission, not user-generated batch requests.


## Local vision
`models.status {}` reports local OCR/inpainting availability with `verified: false`.
`media.ocr.extract` and `media.inpaint` use the existing envelope, queue and cancellation.
See `worker-request.schema.json`, `app/core/vision/vision.ts` for bounds and exact request/result behavior. OCR observations
are evidence, not editor instructions. Draft application is a separate explicit,
revision-checked operation. The manifest, model weights and private paths are not
accepted from renderer IPC.


## Local processing recipes
`processing.schema.json` defines version 1 recipes with optional OCR/inpainting,
at least one enabled step, exact known fields, language and bounded numeric
parameters. Manual rectangles and automatic text targets have distinct shapes.
Cross-field geometry and OCR-vs-existing-subtitle conflicts are checked at runtime.
The same recipe shape is embedded in project, batch, folder and worker schemas;
the parity regression test rejects divergence.

`models.resolve {processing}` is an internal host-to-worker request through the
existing queue. It verifies required local model artifacts and returns exact
fingerprints keyed by `inpainting` and/or `ocr_<language>`. It is neither inference
nor a download and is not an arbitrary renderer command.

`media.process` takes registered source and optional subtitle IDs,
`encoding: review`, recipe and optional expected model pins.
Editor supplies no pins and resolves current configuration at explicit execution;
batch/folder supply their saved pins. Unmatched pins fail
`PROCESSING_MODELS_CHANGED`; existing subtitles plus OCR fail
`PROCESSING_SUBTITLE_CONFLICT`. The request owns all bounded internal stages and
uses the original cancellation envelope. `media.render` retains its strict shape.

Processing results have the existing media artifact fields plus `processing`:
`recipe`, `model_fingerprints`, `ocr_cue_count` and `inpaint_frame_count` (null when
that step is absent). OCR text is burned into the video, not exposed as a sidecar
or assigned to the Editor track. Progress phases are `processingModels`,
`processingOcr`, `processingInpaint`, `processingJoining`, `processingEncoding` and
`processingVerifying`. Fractions are local to a named stage, not fabricated
whole-job completion estimates.

Batch/folder public admission accepts an optional recipe, never model paths or
fingerprint overrides. Trusted host admission resolves and pins required models.
Optional recipe fields represent a disabled processing step, not older-format
support. Retries retain identity and recipe. All projects use the current version
2 schema, with or without processing. Unsupported formats are rejected, not
migrated or reset. Project data remains inert.

Cache identity includes complete canonical recipe, model identities, source/SRT
hashes, interval, algorithm and runtime. Normal cached artifacts live at
`renders/<sha256>/output.mp4` (or `.mkv` for current lossless diagnostic renders); standalone
vision samples retain `renders/<uuid>.mp4`. Host acceptance checks both ID and
exact normalized path, not an unrelated flat-cache assumption. See the versioned evidence for implementation limits.


## Audio, appearance and schema composition

Canonical, always-hand-authored shapes: `subtitles/style.schema.json`,
`editing/soundtrack.schema.json` and `editing/recipe.schema.json`. `cues.schema.json` and
`processing.schema.json` are themselves composed wire schemas (see "Boundary and files"
above): their hand-authored base lives in `cues.source.schema.json` and
`processing.source.schema.json`, and the sync script embeds `subtitles/style.schema.json` and
`editing/recipe.schema.json` into them on generation. Use `npm run contracts:generate` after
editing any canonical or `.source.schema.json` shape; `scripts/sync-contracts.py --check`
verifies the composed project/batch/folder/worker/cues/processing embeddings are current.
Runtime relational checks still enforce trim/end/duration, fades and native file grants.

`asset.register` accepts audio as well as video/subtitle. `audio.probe` takes a
registered audio ID and returns its validated duration. Registration supplies the
content hash; the host combines these with the native-selected path/name.
The trusted host retains native-authorized audio. Worker `media.render` and
`media.process` receive a soundtrack containing registered asset_id + expected
sha256 + mode/start/end/output-offset/gain/fades, never a renderer-selected path.
Project snapshots store the native source descriptor; reopening asks for matching
bytes explicitly instead of trusting that stored path.

Cues may carry a full per-cue style. Processing may carry `subtitle_style` alone
without AI configuration. `subtitles.preview` accepts cues, optional global style
and canvas. `subtitles.save` accepts the same plus explicit srt/ass format.
`subtitles.prepare` additionally requires a registered video ID and optional editing
to produce styled ASS at actual output geometry. It does not retime input cues;
callers decide source vs output clock explicitly. Render burns source-time cues
before playback speed; output subtitle export retimes first and supplies output
geometry. ASS timestamps are centiseconds; SRT does not retain appearance.

Current first-party Library schema is 6; current project schema is 6. These are
current contracts only, not promises to read prior data. Unsupported data fails
without a migration, reset or deletion.


## Composition
`editing/composition.schema.json` is the canonical persisted clip document. The
sync script embeds it in the current project schema and derives a path-free worker shape
with `asset_id`, `sha256` and `duration_ms` per source for media.render/process.
`subtitles.prepare` accepts an optional canvas for composition-aware ASS geometry.
Each clip carries a required `enabled` flag: a disabled clip keeps its placement and
trims on the clock but is left out of preview and export (rendered black and silent),
and cues over its interval are not burned.
Runtime validates unique IDs, relational ranges, minimum clip duration, total
length and native grants/byte identities beyond structural JSON Schema checks.
The optional composition is not an executable processing recipe; AI inside it is
currently rejected. See the composition contract for clocks/limits.


## Text layers and local speech
`subtitles/text-layers.schema.json` is the composed optional text-layer document (hand-authored
base: `subtitles/text-layers.source.schema.json`).
Its current version is 2 inside the sole current project schema **6**. Metadata
owns token, content language, origin, edited and stale state. Transcript,
translated and spoken carry plain cues; displayed metadata refers to the one
existing project `cues` array including its appearance. Each layer also carries a
required `visible` flag; at most one layer is visible, and only that layer is
previewed and burned, while hidden layers keep every cue. Extra properties, unknown
origins/languages, malformed hashes and styled non-display cues are rejected.
Core also enforces a 1,000,000-byte supplemental-layer budget. No older project
schema is read, migrated, reset or rewritten automatically.

The same project schema carries an optional **voice track** — the project's own
generated narration, separate from the music soundtrack. It records the artifact
identity and content hash, the applied voice timing plan, level/fade settings, a copy
origin at the spoken layer token it was generated from, and provenance (engine, model,
voice, runtime, request language/identity). The voice track and the music soundtrack
each carry a required `muted` flag; a muted lane is absent from preview and export,
and its `replace` mode no longer suppresses the original audio. The artifact store is durable: a saved
reference is rediscovered and re-verified through the same inspection a live draft
passes, and a stale, missing, altered or hash-mismatched track is refused by name.
Unreferenced generated audio is collectable. Mixing it into a render is
follow-on work; this contract only gives the
track a durable home and an admission gate.

`speech/recognition.schema.json` defines public requests, trusted worker params,
results and status. Host-native source authorization supplies the byte hash;
renderer requests never grant paths. `speech.status` is a non-verifying capability
check. `speech.configure` verifies a native-selected manifest in the existing
worker queue. `speech.transcribe` takes a registered source, exact model ID,
explicit EN/VI/ZH language and an original-source interval of at most two hours.
Results correlate the public request, language, model, source hash and interval;
segment start/end use source milliseconds, not relative sample or output time.
Empty recognition is valid evidence but must not erase an existing transcript.

`speech/catalogue.json` is the one model-configuration declaration for local
speech. An entry names its **task** (recognition or synthesis), its **engine** from
the set the build implements for that task, its files with declared SHA-256 and sizes,
supported languages, source host, licence and purpose in every UI locale. The host
installs an entry by explicit download or by pointing at a folder the user already
has, writes one bundle record (engine, directory, languages, files) and
hands it to the worker, which validates the engine's own required file set and
checksums and refuses a record whose task/engine or files do not match. Adding an
engine is code plus a catalogue entry, never a second configuration format. A bundle
record declares content identity, not model quality, licensing or authenticity.

The sync script composes these canonical contracts into worker/project schemas.
No second speech queue or parallel displayed-cue store exists. Applying a result
is separate from executing it, revision checked and whole-document undoable;
unapplied UI drafts are not durable recovery records. The applied voice track is durable
(above), but time-aligning and mixing it into the render, composition/batch speech and
provider accounts remain outside this slice.


## Reviewed translation
`speech/translation.schema.json` owns self-contained input, worker_params, result,
status, origin and literal-rule shapes. `speech/translation-model.schema.json`
defines the trusted local bilingual bundle. `translation.status` is lightweight
and always unverified, `translation.configure` hashes native-selected files, and
`speech.translate` takes captured plain timed text with explicit pair/model/rules.
No renderer file paths or style-bearing cues are accepted. Runtime additionally
checks relational/time/identity/byte/UTF-16 limits not expressible in JSON Schema.

The sync script injects translation origin into the current text-layer schema and
embeds that in the project schema, and adds the three methods to the worker transport. Text
layers are one current shape. Source changes reject old drafts; reviewed target merges are
pure core logic. No old project/text schema reader or reset is retained. Full
operating semantics and compatibility limits are unchanged.
