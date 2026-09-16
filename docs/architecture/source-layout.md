# Source ownership — integration 0.13.0

The root AGENTS.md is the single instruction file. Business ownership is nested
inside runtime ownership, rather than mixing Python, renderer code and trusted
filesystem access into one feature directory. Changes cross these boundaries
through typed IPC and the existing NDJSON worker protocol.

## Runtime and business modules

| Location | Responsibility | Must not own |
| --- | --- | --- |
| `app/ui/features/library/` | Sources peer views, import decisions, paged selection and linked-file details | Trusted paths, filesystem copying or automatic render execution |
| `app/ui/features/settings/` | User preferences, component setup and runtime facts | Account fabrication, package installation or silent inference |
| `app/ui/features/editor/` | Cue editing, undo, preview, timeline and explicit render controls | Filesystem access, model inference, saved batch execution |
| `app/ui/features/batch/` | Local draft selection, queue snapshots and user commands | A second queue, output publishing or persistence policy |
| `app/ui/features/folders/` | Folder-rule drafts and saved monitoring state | Watcher execution, trusted paths or entitlement authorization |
| `app/ui/features/processing/` | Shared recipe form, normalized mask values and bilingual execution/recovery states | Inference, auto-run effects or thin library wrappers |
| `app/ui/features/vision/` | Model availability, OCR drafts, removal requests and stale-result handling | Model installation, inference or automatic replacement of manual edits |
| `app/ui/shell/` | Workspace navigation and UI locale | Business execution |
| `app/ui/design-system/` | Shared Astryx theme/locale and confirmation lifecycle | Prop-for-prop primitive wrappers |
| `app/ui/bridge/client.ts` | Decode success/error IPC replies consistently | Feature-specific policy or raw filesystem access |
| `app/electron/features/` | Native picker grants, typed IPC and feature lifecycle | Media processing or duplicated core rules |
| `app/electron/runtime/` | Guarded IPC/drain lifecycle, app/media protocols, CSP and file grants | Feature business rules or media processing |
| `app/electron/features/media/` | Registered source/artifact identity and opaque URL mapping | UI state or queue ownership |
| `app/core/catalog/` | Workspace catalog transactions, revisions and composition | Feature-specific forms or a second worker |
| `app/core/taxonomy/` | Shared label identity, contextual assignment and references | AI classification or inferred product identity |
| `app/core/profiles/` | Reusable, data-only processing configurations and current-format imports | Per-video masks/cues, credentials or execution |
| `app/core/automation/` | Saved workflow definitions, immutable run admission and run state | A second queue, implicit scheduling or channel-owned routing |
| `app/core/distribution/` | Channels, Shopee links, concrete export-backed drafts, usage and planned instants | Fake OAuth, publication or a production scheduler |
| `app/core/storage/` | Atomic fresh SQLite initialization and current-schema rejection | Migrations, destructive repair or feature rules |
| `app/ui/features/catalog/` | Shared mutation/refresh/dirty lifecycle | A generic CRUD framework or primitive wrapper library |
| `app/ui/features/taxonomy/` | Contextual label selection and catalog editing | Separate per-feature vocabularies |
| `app/ui/features/profiles/` | Profile editing, file import/export and explicit application | Auto-running a recipe or hiding per-video restrictions |
| `app/ui/features/automation/` | Workflow list/edit/input selection and shared-queue run history | A duplicate jobs screen or autonomous triggers |
| `app/ui/features/distribution/` | Channel/link/post views and planned-time editing | Publishing permission or duplicated post storage |
| `app/core/library/` | SQLite catalogue/links, import integrity, duplicate and relink rules | Removing user files or executing media jobs |
| `app/core/settings/` | Strict versioned preference snapshots and atomic serialized writes | UI locale rendering, native dialogs or cloud accounts |
| `app/core/subtitles/` | Cue invariants, timing, split/merge/replace and history | React state or library rendering |
| `app/core/projects/` | Project validation and source identity | Starting processing on load |
| `app/core/rendering/` | Request tracking, revision checks and artifact acceptance | A separate renderer engine |
| `app/core/batch/` | SQLite journal, queue lifecycle and safe output publication | Cloud scheduling or billing |
| `app/core/folders/` | Observations, stability, exclusions and idempotent admissions | A duplicate processing queue |
| `app/core/processing/` | Canonical recipe validation, required model identities and immutable snapshots | React, native libraries or a second executor |
| `app/core/vision/` | Vision request/result validation and draft application rules | Loading weights or editing React state |
| `app/core/media/` | Media types, hashing, source-alias protection and verified native-consented exports | Rendering engines, file-picker UI or cache deletion |
| `app/core/worker/` | NDJSON client transport and child lifecycle | UI/Electron imports |
| `worker/runtime/` | Protocol, queue, errors, cancellation and native process lifecycle | Editing or model-specific image transformations |
| `worker/assets/` | Registered original references and change detection | Replacing user files |
| `worker/media/` | FFmpeg probe, waveform and render execution | UI layout or automation policy |
| `worker/subtitles/` | Cue validation and pysubs2 serialization | A fallback custom subtitle parser |
| `worker/processing/` | Full-duration chunk orchestration, OCR assembly, model pin checks and final publication | A second queue, cloud calls or custom subtitle parsing |
| `worker/vision/` | Atomic local configuration, model registry, geometry/adapters and killable inference subprocess | Cloud downloads, a second scheduler or a mock production fallback |

`app/ui/main.tsx` mounts shared providers. `app/ui/App.tsx` composes workspaces and
collects dirty state. `worker/main.py` handles startup and input framing.
`app/electron/main.ts` remains the host composition/lifecycle boundary.

## Cohesion, not arbitrary splitting

The editor model owns related editing state. Media adapter effects and rendering
subscription/cancellation are separate because they have independent lifecycles.
Folder drafts are separate from saved rules; a failed save does not mutate the
saved snapshot. Batch draft selection is distinct from durable queue records.

`TimeInput` is retained because the application stores milliseconds while
NumberInput edits seconds. It is not a new visual primitive. Astryx remains
responsible for numeric draft parsing and commit behavior. The shared confirmation
provider owns asynchronous dialog settlement and unmount handling; it is not an
AlertDialog prop mirror. The IPC decoder removes repeated protocol validation
from multiple feature callers. No generic configurable form/CRUD framework exists.

Use direct category imports for Astryx controls. Feature CSS lives next to its
feature and owns layout only. `style.css` composes layers/base accessibility;
`design-tokens.css` maps native media/layout aliases to Astryx tokens. Do not reach
through selectors into control internals or duplicate AppShell's main landmark.

## Verification

`npm run test:architecture` checks module ownership, entry points, instruction
uniqueness and the 450-line implementation ceiling. `npm run test:ui-library`
checks library usage, catalogue coverage and CSS ownership. Behavioral core,
worker and bridge tests remain authoritative for execution semantics. Static
rules cannot prove readability, type compatibility, keyboard access or visual
quality; see the versioned RESULTS report for the actual evidence boundary.

## Cross-feature transactions

`LibraryService` validates source bytes before catalogue commits and owns only its
new copy directory during rollback. `LibraryStore` records links and soft-removes
listings; it never deletes files. Library-origin batch input carries the exact
record ID through the existing journal, allowing the host to reconcile completed
exports after a restart without a second execution path.

`media/files.ts` centralizes shared hashing and source-alias protection. Chosen
Editor exports use native overwrite consent and a verified temporary replacement;
batch publication intentionally remains exclusive/no-overwrite. Similar low-level
operations do not erase these different policies. All callers import shared
media functions from their owning module; obsolete re-exports have been removed.

Host feature modules own native picker grants and request validation. The common
IPC wire rejects foreign frames and new requests during closing, then drains
accepted handlers before Library persistence is closed. `main.ts` composes this
ordering; it does not own catalogue, import, model or Editor business rules.

`LocalModelSetup` is shared because it owns a cancellable host transaction and
its persistent success/error state, not because it restyles Button. Library and
Settings compose Astryx directly. The single `useBatchQueue` lives at workspace
composition and is passed to the existing panel; navigating away does not create
a second queue subscription or abandon the selected draft.


## Processing responsibilities

`recipe.ts` is browser-safe and contains strict data validation rather than UI state.
Batch and folder stores persist canonical copies and model pins; the existing
coordinator forwards them to `media.process`. Projects add optional recipes through
the single current v4 format. There is no older-project reader or migration pipeline.

Python `processing/recipe.py` validates the worker trust boundary;
`processing/chunks.py` owns sampling-grid alignment, raw-frame budget, cue merging
and segment assembly; `processing/service.py` owns the whole operation and final
identity checks. The existing vision service still owns model adapters/killable
inference. `media/encoding.py` and `media/cache.py` are shared by ordinary rendering
and processing because FFmpeg subtitle timing, audio mapping and cache publication
must not drift between two real callers. There is still one execution queue.

`ProcessingOptions` composes consequential business choices, defaults and conflicts
across Editor, batch and folders. `MaskRegionFields` owns normalized ↔ percent
conversion and mask geometry feedback used by both sample and full processing.
Neither re-exports a primitive library API. Artifact-path validation is a separate
host trust boundary and accepts only the actual UUID sample/SHA cache layouts.


## Scope-first preservation

`docs/architecture/system-map.json` owns implemented and reserved boundaries.
`docs/planning/scope-traceability.json` traces feature and flow coverage to the
business specifications. `SYSTEM_MAP.md` and `scope-coverage.md` are generated views;
`retained-paths.json` protects delivered source paths, not obsolete runtime APIs.
The scaffold command creates only missing `.gitkeep` files, never source stubs.

Catalog saves use optimistic record revisions and one SQLite transaction per
mutation. `useRecordDraft` shares the actual dirty/confirmation/reset lifecycle
between channel/link/profile/workflow forms; each form retains its domain fields.
Post plans store a concrete instant plus timezone. DateTimeInput edits wall time;
`post-schedule.ts` owns timezone conversion, missing-hour and repeated-hour checks.

The shared SQLite initializer creates a schema only in a genuinely new store.
Unknown/incomplete schemas fail without repair or migration. One current project
schema covers both ordinary and processing projects. Historical ZIPs are evidence,
not a reason to retain old import surfaces or duplicate execution paths.


## 0.11 concrete ownership

`app/core/library/library-assets.ts` owns file/link byte identity; the existing
LibraryStore owns persistence and pagination. `features/library/assets` in host/UI
owns native grants and the read-only asset workspace respectively. Batch keeps
its queue and only awaits verified Library indexing; there is no second journal.

`app/core/editing/soundtrack.ts` owns clip validation, while `worker/media/audio`
owns audio probing and FFmpeg composition. Project/history/recovery store applied
soundtrack state. `app/core/subtitles/style.ts` and `worker/subtitles/style.py`
validate their runtime boundary; `document.py` uses pysubs2 for serialization.
The shared SubtitleStyleForm owns explicit draft/apply/stale/inherit semantics.

Canonical JSON shapes live under `contracts/editing` and `contracts/subtitles`.
`scripts/sync-contracts.py` generates self-contained embeddings so direct consumers
need not implement a custom reference loader. Large generated JSON is not handwritten
application logic; `contracts:check` prevents independent copies drifting.


## 0.12 composition ownership

`app/core/editing/composition/` owns persisted clip validation, gapless clock maps,
caption fragment remapping, explicit edit commands and atomic snapshot bounds.
`app/core/projects/editor-timeline.ts` is pure validation usable by the renderer;
`project.ts` retains native filesystem save/load and is not imported as a UI value.
`app/core/rendering/composition-input.ts` prepares path-free worker clip grants.

`app/ui/features/editor/composition/` composes existing Astryx controls and owns
selected-source audition. Existing timeline and processed player remain owners of
clock interaction and real sample viewing. `app/electron/features/editor/composition/`
owns native pick/start/preview grants; `features/projects/dependencies.ts` restores
complete project dependencies before changing the active editor. MediaRegistry
owns grants and captured export provenance; Library owns content/member linking.

`worker/media/composition/` owns validation/normalization of a requested montage
interval. `worker/media/render_source.py` resolves either a single source or that
interval into the same encoder. Global timing offset is explicit and tested with
caption burn, source audio and a final-output soundtrack. No new executor exists.


## 0.13 text and recognition ownership

- `app/core/subtitles/layers/` owns strict independent metadata/content, provenance,
  stale-copy propagation and explicit copy/review commands. No Node imports.
- `app/core/speech/` owns browser-safe request/result/status contracts and the
  coordinator around the existing WorkerClient port, not another scheduler.
- `app/core/worker/remote-error.ts` owns one shared error identity used by actual
  speech, vision, rendering, batch and folder consumers without importing Node
  transport into renderer validation. Worker transport consumes that identity.
- `app/electron/features/speech/` owns native model selection/source authorization,
  typed IPC, setup/job cancellation and model-change events.
- `worker/speech/recognition/` owns manifest verification, timestamp semantics,
  PCM extraction and a local-only inference subprocess. `worker/runtime/offline.py`
  shares the Python audit guard with existing vision; it is not an OS sandbox.
- `app/ui/features/editor/text-layers/` owns layer selection/copy review;
  `app/ui/features/speech/` owns capability/setup/job/session-draft states. Neither
  starts work on navigation or directly writes models/media/project files.

The project contract is version 4. Generic history, imports, recovery and
composition commands retain all layers; `snapshot.cues` remains the only displayed
track. The cue table and existing timeline target the selected layer. Unapplied
speech drafts remain session-only. Translation, synthesis and alignment boundaries
stay reserved; owning source paths does not declare their implementation complete.


## 0.14 translation ownership

`app/core/speech/translation/` owns browser-safe captured text/rules contracts,
review/merge/application and a Node-only coordinator on the existing worker port.
`app/core/subtitles/layers/translation-origin.ts` owns strict persisted provenance;
existing layer commands invalidate both copy and translation descendants. The old
copy-only review command is replaced by `reviewLayerSource`, not retained as an alias.
`app/electron/features/speech/translation/` owns native model setup and typed IPC.
`worker/speech/translation/` owns manifest/configuration, bounded literal rules and
local child inference, not another queue. `worker/runtime/model_result.py` owns
atomic child-result publication shared with STT. UI translation components reuse
Astryx and existing Editor history without importing filesystem project services.

Current project schema is 5; text layers are 2. Older section numbers above are
historical. Synthesis/alignment remain reserved. Applied translation persistence
is implemented; unapplied drafts are session-only. Real models and loaded UI still
require owner acceptance.


## 0.15 synthesis ownership — current

`app/core/speech/synthesis/contracts.ts` and `review.ts` are browser-safe captured
spoken-text contracts and stale checks. Node-only `coordinator.ts` and `artifacts.ts`
own existing-worker correlation and verified, confined WAV/receipt admission,
preview/export, cancellation disposal and source/model overwrite protection.
`app/electron/features/speech/synthesis/` owns native configuration, typed IPC and
opaque, expiring two-phase save choices. Renderer code never supplies a filesystem
path. Native-selected manifests join the existing original-file protection set.
`worker/speech/synthesis/` owns strict local model/preset setup, bounded inference in
a child, PCM validation and atomic output promotion; it creates no new queue.
`app/ui/features/speech/synthesis/` owns setup/job/draft/audition/manual review and
post-dialog stale checks. It never edits document text, soundtrack or render state.

Current project schema remains 5; text layers remain 2. Older ownership statements
above are historical. Alignment remains reserved. The synthesis marker is retained
although its runtime now has an implemented slice; markers are not completion proof.
