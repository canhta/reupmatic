# Changelog

Source handoffs use increasing application versions. Historical evidence is not
rewritten to imply tests were run for a later handoff.

## 0.15.0 — Reviewed local speech artifacts

- Added bounded spoken-layer preset synthesis with VI/EN declaration, native
  hash-pinned VieNeu v3 Turbo ONNX/CPU configuration and the existing shared queue.
- Added cancellable/reaped inference, token/audio bounds, source capture, model
  revalidation, atomic natural PCM WAV/receipt promotion and temporary cleanup.
- Added audition/manual review, paginated captured-text/timing comparison, safe
  media preview grants, native WAV/receipt saves and post-dialog stale checks.
- Protected imported originals, model presets/configuration and live artifacts;
  failed/cancelled retries retain the previous reviewable draft.
- Project schema 5/text layers 2 stay unchanged. Voice drafts/review are session-only.
  No cloning/download, alignment/mixing, automatic text/soundtrack edits or durable
  batch/Automation speech stage is introduced. Real SDK/model and installed UI
  acceptance are still open; controlled inference is not voice-quality evidence.

## 0.14.0 — Reviewed local translation

- Added bounded CPU/int8 bilingual CTranslate2/SentencePiece translation via the
  existing host/worker queue, explicit native manifest setup and hash verification.
- Captured source/languages/model/literal target rules; separate session drafts,
  ID/time-aware paginated preview, conservative keep-existing default and confirmed
  whole-layer replacement. No automatic displayed/spoken-text replacement.
- Added source/target stale guards, translation provenance/invalidation, complete
  undo/redo, save/recovery roundtrips and common composition-clock rebasing.
- Added cancellable child execution, progress correlation, bounded/truncation/output
  checks, temporary cleanup, EN/VI controls and versioned test/skills evidence.
- Current project schema is 5; text layers are version 2. Earlier formats are
  rejected intact, without compatibility/migration/reset. TTS/alignment and real
  model/installed UI acceptance remain open; this is a source-only handoff.

## 0.13.0 — 2026-09-16

- Continue 0.12 with independent transcript, translated, spoken and displayed text
  layers. Reuse the existing cue editor/timeline; keep displayed captions as the
  only rendering track. Retain language/provenance, whole-document undo/recovery
  and all-layer composition time mapping.
- Add explicit copy preview/apply, transitive stale metadata and human-reviewed
  keep-edits without automatic replacement. Import/export targets the selected
  layer; presentation-only subtitle changes do not invalidate spoken content.
- Integrate a local-only faster-whisper CPU adapter with native manifest selection,
  model/source SHA-256 checks, explicit source language, source-clock segments,
  delayed-audio-aware PCM extraction and an existing-queue cancellable child.
  STT drafts require explicit transcript replacement; empty/stale/source-changed
  results cannot silently wipe edited text. No translation, TTS or paid fallback.
- Separate browser-safe remote errors from Node transport. Add runtime-import
  boundary, layered project/SQLite recovery, strict speech contract, model manifest,
  native FFmpeg, cancellation/cleanup and SDK-double integration regressions.
- Current project schema becomes 4; canonical contracts and active callers/fixtures
  change together. No compatibility reader, migration, reset or old-source removal.
  Preserve original assets, skills, markers and earlier release evidence.
- Record installed-dependency, real-model, target-platform and visual/IME gates as
  unverified. Next sequential archive is 0.14, beginning translation preview/apply
  on the new independent layers before voice synthesis and alignment.

## 0.12.0 — 2026-09-16

- Continue the supplied 0.11.0 source with a bounded multi-clip Editor composition:
  native append, source trim/speed, reorder, split, contiguous join and removal.
  Keep one existing timeline, renderer and worker queue. Normalize hard cuts to a
  fixed even canvas at 30 fps; synthesize silence for clips without audio.
- Map existing caption fragments through clip/source coordinates and preserve
  text/appearance. Commit composition, captions and clamped sample/trim bounds in
  one undoable snapshot; reject stale staged range edits. Add EN/VI controls and
  distinguish selected-source audition from actual processed sample playback.
- Assemble only the requested sample/trim intersection. Apply global edits,
  composition-timed captions and final-output music through existing encoding.
  Verify all source bytes/durations, cache by composition/interval/runtime, retain
  cancellation cleanup and original-file protection.
- Current project format becomes schema 3 with no legacy reader or automatic
  migration. Reauthorize all distinct clip sources and music before restoring a
  project/recovery document. Library accepts project-member associations and
  records known member project/export links without claiming a complete graph.
- Add core, schema, native-media and real-coordinator tests. Record local skill
  activation, unchanged owner visual reference, API research and blocked installed
  package checks. Preserve all scoped/reserved paths and supplied public assets.
- Limits remain explicit: no transitions/layered tracks, no composition AI removal
  or OCR, no multi-clip batch/folder admission, no real UI/installer approval. Next
  archive is 0.13; speech/text layers and remaining product flows stay on the plan.

## 0.11.0 — Assets, soundtrack and subtitle appearance

Continues 0.10.0 without replacing prior archives. Source delivery; the owner
handles installers and full application E2E.

- Sources Assets view: immutable project/export/subtitle/audio links, native
  attachment, exact-file validation, scoped search/pagination and read-only previews.
- One imported soundtrack in Editor: trim/output placement, replace or mix original,
  gain/fades and shared actual sample/full FFmpeg encoding. Applied tracks survive
  undo, project save and recovery; native matching-audio selection is required on open.
- Global/per-cue subtitle appearance and independent source/output ASS or SRT export.
  Global style is reusable across processing profiles, without copying per-video audio.
- Audio/content cache checks and awaited batch Library indexing prevent silently
  redirecting existing references to changed files. Project save reports partial linking.
- Current Library schema is 2; reject unsupported stores without migration or reset.
  Added business-owned style/soundtrack schemas and deterministic contract composition.
- Preserved all scope groups, business boundaries, marker files and public assets.
  Multi-clip, speech/text layers, Downloads/classification and real distribution remain open.

Evidence and limitations: `research/integration-0.11/RESULTS.md`.

## 0.10.0 — 2026-09-16

- Add a strict single-source editing recipe for trim/crop/flip/color/output framing,
  speed and source-audio gain/mute. Connect Astryx controls, shared profiles,
  projects, sample/full processing and the existing batch/folder/workflow queue.
- Retain source-clock subtitles through native transforms and speed; add edited
  output SRT export. Fix lossless no-audio duration by keeping the explicit source
  frame rate instead of an encoder default.
- Add whole-document undo/redo and local SQLite recovery with document identities,
  optimistic revisions, explicit copy/discard and close-time flush/failure choice.
- Add displayed-subtitle replacement preview/apply/undo in a cancellable regex
  Web Worker and transactional bulk timing shifts; no hidden cross-layer edits.
- Implement independent full-source OCR extraction, bounded shared scans, complete
  chunk evidence publication and direct SRT export. Controlled SDK tests are not
  evidence of real recognition accuracy.
- Update current contracts and all feature/flow maps; preserve all original public
  bytes, boundary markers and a single root AGENTS.md. No compatibility branch.
- Still missing: multi-clip/audio replacement/styles/language layers and speech,
  downloader/classifier, production triggers/scheduler/OAuth/publishing, resource
  and account services, cloud and installers. See scope coverage for exact gaps.

## 0.9.0 — 2026-09-15

- Build persisted local Channels/Affiliate/Post workspaces, shared category/tag
  identity and Library assignments. Pin export/destination/link choices in draft
  posts, support edit/cancel/reverse usage and keep publication unconnected.
- Add planned-time editing with an explicit timezone, missing-hour rejection and
  repeated-hour selection. Plans remain metadata; no hidden publisher/scheduler.
- Add reusable current-format processing profiles and explicit application across
  Editor/batch/workflow forms. Per-video manual masks cannot become reusable profiles.
- Add saved workflows, Library input selection, immutable recipe/model snapshots,
  shared-queue admission/recovery and run history. Keep execution developer-gated;
  do not create a parallel worker, production trigger or billing policy.
- Preserve all 14 scope groups, five areas and three modes in a 22-module map with
  76 feature slices, 24 flows and 96 `.gitkeep` boundaries. Guard source retention,
  unsafe paths, scaffold idempotency, generated maps and placeholder packaging.
- Record all owner rules in the single root AGENTS.md, including greenfield-only
  contracts, deliberate Astryx reuse, no thin wrappers, source preservation and
  completion notifications. Remove dual project readers and compatibility exports;
  unsupported stores fail without repair, migration or destructive reset.
- Replace the separate developer batch loop with the current durable queue and
  require an isolated new CLI workspace. Fix the channel form's reset handler.
- Preserve the original 12 public assets. Source-only handoff; installed UI build,
  full Electron behavior, real-model quality and target-OS installers are not passed.

## 0.8.0 — 2026-09-15

- Connect a strict, data-only processing recipe to Editor sample/full rendering,
  manual batches and developer-gated folder rules through the existing queue.
  OCR on the original precedes removal and generated-caption burn-in. Existing
  user cues/attached SRT conflict with automatic OCR rather than being replaced.
- Process full durations in sample-grid/disk-bounded OCR windows and ten-second
  removal chunks. Use FFV1 internal video chunks, concatenate, then encode final
  review MP4 with source audio once. Removal remains maximum 960-pixel long edge
  and 24 fps; real-model and temporal quality are not verified.
- Snapshot required model fingerprints during batch/folder admission. Preserve
  recipe and pins across restart/retry; fail changed model configurations with an
  actionable error. Save recipe-bearing projects as v2 while retaining v1 reads
  and v1 writes for projects without processing. Opening never starts inference.
- Compose one domain ProcessingOptions form from Astryx controls. Reuse normalized
  region editing with Local vision; add EN/VI progress, conflict, quality and model
  recovery states. Keep choices off by default and execution warnings visible.
- Fix host acceptance of renders/<sha256>/output.mp4 instead of incorrectly
  expecting the file directly inside renders. Validate artifact IDs/paths.
- Share native encoding and verified render-cache behavior across ordinary renders
  and processing. Reject mismatched cache recipes and same-size/same-time source
  changes. Bound OCR progress monotonically within a stage, release raw frames
  between chunks, clean owned temporaries on cancellation and await queue close.
- Add recipe/schema parity, persistence, queue propagation, artifact-boundary,
  chunking and actual-media tests. Native AI tests use controlled SDK adapters;
  they do not certify genuine OCR/LaMa inference or subtitle-library availability.
- Increment source packaging to 0.8.0; preserve prior ZIPs and all public assets.
  Full Electron/UI/target-platform verification remains owner-side. Downloads,
  account/channel posting, billing, dubbing and platform installers are not added.

## 0.7.0 — 2026-09-15

- Add a local SQLite Library with explicit reference/copy imports, SHA-256 duplicate
  policies, bounded paged search, same-byte source relinking and non-destructive
  removal of listings. Missing/changed sources do not silently become new content.
- Connect Library records to Editor and saved projects, and stage selected records
  through the existing batch draft/queue. Persist source identity and project,
  subtitle and video links, including completed batch outputs across restart.
- Add Settings for native-picked default output folders, independent UI locale,
  runtime details and local model-manifest configuration. Check artifact hashes,
  persist canonical paths atomically, retain previous setup on failure and respect
  the explicit environment override. No automatic network download or inference.
- Compose Sources and Settings with documented Astryx TabList, Table, MetadataList,
  RadioList, Section, Collapsible, Banner and confirmation semantics. Keep a single
  mounted queue and the specialist media controls. Restore missing Vietnamese
  vision resources in the actual i18n configuration.
- Separate host startup, protocols, guarded IPC, media grants, Editor, Library and
  Settings responsibilities. Share hashing/source protection and chosen-export
  publication by behavior, not through pass-through services or primitive wrappers.
- Guard late Editor opens and subtitle imports against revision changes. Save
  SRT/MP4 via verified temporary files and an atomic replacement; preserve originals,
  artifact aliases and prior exports on failure. Report saved-but-unlinked files.
- Restore all 12 supplied public assets byte-for-byte, connect icons/branding and
  prevent source packaging from dropping `.ico` or `.webmanifest` files.
- Add core/native/protocol/packaging regression coverage. Increment source delivery
  from 0.6.0 to 0.7.0; preserve prior archives and historical evidence.
- Remaining: resolved dependency lock, full UI/host build and Electron interaction,
  actual OCR/LaMa model quality, installed watcher tests and platform installers.
  Online downloads, channel/account services and vision in batch/folder workflows
  are not implemented by this handoff. See the versioned verification report.

## 0.6.0 — 2026-09-15

- Organize UI/core/host/worker code by business capability within explicit runtime
  boundaries. Separate editor effects, batch drafts, folder forms and IPC ownership.
- Keep one root AGENTS.md with maintainability, deduplication, nontrivial abstraction,
  Astryx discovery/selection and strictly increasing source-package rules.
- Add a local engineering-skill adaptation of the supplied Matt Pocock workflows;
  retain the original UI design reference and document newer Astryx precedence.
- Select Astryx as the general UI system, retain specialist media libraries,
  document the catalogue/task map, and use library-owned control/theme semantics.
  Split layout CSS by feature and remove inherited primitive-control overrides.
- Add local-model status, bounded OCR drafts and LaMa sample adapters through the
  existing worker queue. Validate model manifests/checksums, preserve raw evidence,
  isolate inference cancellation and reject stale draft application.
- Add controlled-adapter/native FFmpeg coverage and repair test imports after moves.
- Add a source packager that checks version coherence, refuses duplicate/downgrade
  handoffs, excludes non-source artifacts and embeds per-file SHA-256 metadata.
- Remaining gates: dependency installation/real lock, actual UI type/build/E2E,
  installed Chokidar events, true OCR/LaMa inference/quality/license and target-OS
  delivery. This is a source ZIP, not an installer or production AI/UI approval.

## 0.5.0 — supplied baseline

Local UI skill, folder intake into the saved batch queue and bounded core/native
checks. The supplied `reupmatic-v0.5.zip` is preserved as the comparison baseline;
its historical evidence remains under `research/integration-0.5/`.
