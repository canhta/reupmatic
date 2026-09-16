# Scope delivery and remaining work — 0.15.0

Generated from `scope-traceability.json`. Business authority remains `BUSINESS_SCOPE.md` and its linked specifications.

**Partial is not complete. Planned paths and `.gitkeep` markers are not implemented features.**

Direct editing, user-started batch and Automation remain independent modes. UI language does not change content or schedule instants.

## Five task areas

| ID | Area | Owner |
|---|---|---|
| SCR-01 | sources | library |
| SCR-02 | editor | editor |
| SCR-03 | channels | distribution |
| SCR-04 | automation | automation |
| SCR-05 | settings | settings |

## SC-01

### SC-01-F01 — Local video intake

**partial** · Owners: library

Delivered slice: Native local import; optional Library and direct Editor opening.

Remaining: External-source intake is independent.

Authority: [specs/sources-library.md](../../specs/sources-library.md)

### SC-01-F02 — URL, profile and share-text discovery

**planned** · Owners: downloads

Delivered slice: No implementation in this release.

Remaining: Source detection, available metadata, pagination, candidate selection and real-field filters.

Authority: [specs/sources-library.md](../../specs/sources-library.md)

### SC-01-F03 — Authorized source connection

**planned** · Owners: downloads, accounts

Delivered slice: No implementation in this release.

Remaining: Douyin connect/reconnect, approved browser cookies, secure session persistence, headed/headless verification.

Authority: [specs/sources-library.md](../../specs/sources-library.md)

### SC-01-F04 — Download tasks and destination

**planned** · Owners: downloads, batch

Delivered slice: No implementation in this release.

Remaining: Progress, cancellation, retry, duplicate handling and download-only completion to a chosen folder.

Authority: [specs/sources-library.md](../../specs/sources-library.md)

### SC-01-F05 — One-time download versus monitoring

**planned** · Owners: downloads, automation

Delivered slice: No implementation in this release.

Remaining: Distinct Download selected and Create automation actions sharing asset/results state.

Authority: [specs/sources-library.md](../../specs/sources-library.md), [specs/automation.md](../../specs/automation.md)

### SC-01-F06 — RedNote integration research

**planned** · Owners: downloads

Delivered slice: No implementation in this release.

Remaining: Research target, not a committed connector or release date.

Authority: [BUSINESS_SCOPE.md](../../BUSINESS_SCOPE.md)


## SC-02

### SC-02-F01 — Content entry and complete asset graph

**partial** · Owners: library

Delivered slice: Library asset views and immutable project/export/subtitle/audio references; composition projects may associate with member sources and saved project/export links extend to known member content records.

Remaining: Complete transcript/analysis/derivation graph, duplicate-entry propagation, dependency inspection and deletion lifecycle.

Authority: [specs/sources-library.md](../../specs/sources-library.md)

### SC-02-F02 — Reference-first import, copy and relink

**partial** · Owners: library

Delivered slice: Reference/copy import and hash-checked source relinking.

Remaining: Complete project-graph relocation and unresolved retention rules.

Authority: [specs/sources-library.md](../../specs/sources-library.md)

### SC-02-F03 — Identity and deliberate reuse

**partial** · Owners: library, runtime

Delivered slice: Original SHA-256 identity and immutable derived-link identities including byte size/hash; changed bytes at the same path produce a distinct link and fail old-link availability checks.

Remaining: Complete multi-stage dependency invalidation, external-source identity and retention/reclamation policy.

Authority: [specs/sources-library.md](../../specs/sources-library.md)

### SC-02-F04 — Search, selection and manual labels

**partial** · Owners: library, taxonomy

Delivered slice: Source search/labels plus paginated asset kind, content and filename/path search. Selection exposes original-record context.

Remaining: Combined taxonomy/semantic/date filters across all future text, audio, analysis and distribution artifacts.

Authority: [specs/sources-library.md](../../specs/sources-library.md), [specs/content-analysis.md](../../specs/content-analysis.md)

### SC-02-F05 — Exact asset opening and handoff

**partial** · Owners: library, distribution

Delivered slice: Exact linked project opening resolves anchor and every distinct clip/music source before replacing the editor; unchanged bytes and durations required. Other linked export/audio/subtitle viewing remains.

Remaining: Source-independent project discovery/editing, automatic repair and complete cross-stage artifact handoff.

Authority: [specs/sources-library.md](../../specs/sources-library.md)

### SC-02-F06 — Separate removal and file deletion

**partial** · Owners: library, distribution, automation

Delivered slice: Non-destructive Library removal and dependency visibility; referenced drafts/workflows block removal.

Remaining: Explicit original/generated/cache deletion, retention, active-use overrides and recovery policies remain open.

Authority: [specs/sources-library.md](../../specs/sources-library.md)


## SC-03

### SC-03-F01 — Baseline video transforms

**partial** · Owners: editor

Delivered slice: Source-time trim, normalized crop, output aspect/contain-cover sizing, flip and basic color in Astryx controls, shared recipe and native sample/full rendering.

Remaining: Clip splitting/composition, visual transform handles and interactive transform preview; real UI acceptance remains open.

Authority: [specs/editor.md](../../specs/editor.md)

### SC-03-F02 — Composition, speed and audio tools

**partial** · Owners: editor, speech

Delivered slice: Bounded 64-clip hard-cut composition with per-clip source trim/speed, split, contiguous join, reorder and removal. Shared native sample/full encoding normalizes mixed sources; global edits and one output-clock replacement/mixed soundtrack remain.

Remaining: Transitions, layered/multiple audio/video tracks, aligned/generated voiceover integration, per-clip effects and AI, multi-clip batch/folder admission, native-rate/VFR acceptance.

Authority: [specs/editor.md](../../specs/editor.md)

### SC-03-F03 — Media, preview and timeline workbench

**partial** · Owners: editor, subtitles

Delivered slice: Selected-layer table and specialist timeline share independent cues; media render/preview remains display-only. Composition spans and source audition use the existing clock maps.

Remaining: Continuous effects playback, composition waveform/proxies, VFR, installed keyboard/IME/accessibility and visual acceptance.

Authority: [specs/editor.md](../../specs/editor.md)

### SC-03-F04 — Actual sample processing and caches

**partial** · Owners: editor, processing, runtime

Delivered slice: Existing shared coordinator assembles only the requested composition/trim interval before final edits/captions/audio. Real FFmpeg tests cover mixed rates/sizes, silence, late/cross-cut samples, soundtrack timing, frame-grid rounding, cache and cancellation.

Remaining: Composition OCR/removal, resource-budgeted long-duration acceptance, motion-level sample/full equivalence and native-resolution final mastering.

Authority: [specs/editor.md](../../specs/editor.md), [specs/local-processing.md](../../specs/local-processing.md)

### SC-03-F05 — Undo, project save, autosave and recovery

**partial** · Owners: projects, subtitles

Delivered slice: Atomic schema-4 project/history/recovery retains four text layers, provenance, stale states, composition, styles and music. Old project formats fail explicitly; native dependency reauthorization remains required.

Remaining: Durable unapplied AI evidence, full crash/close and installed desktop recovery acceptance.

Authority: [specs/editor.md](../../specs/editor.md)

### SC-03-F06 — Optional reusable profiles

**partial** · Owners: profiles, processing

Delivered slice: Reusable framing/color/speed/source-audio, OCR/removal and global subtitle appearance; same style form in Editor and processing profiles. Clip-specific trim/music/cue overrides stay out of reusable profiles.

Remaining: Speech/language/voice, rule chains, multi-stage preset dependencies and complete profile lifecycle.

Authority: [specs/editor.md](../../specs/editor.md)


## SC-04

### SC-04-F01 — Timestamped editable speech recognition

**partial** · Owners: speech

Delivered slice: Local faster-whisper CPU/int8 adapter, explicit manifest/language/source-range selection, segment timestamps, correlated draft review/apply and real worker cancellation; native tests use controlled SDKs.

Remaining: Real-model EN/VI/ZH accuracy and long-duration acceptance; terminology/punctuation tools, premium adapter and batch/Automation speech admission.

Authority: [specs/editor.md](../../specs/editor.md), [specs/local-speech.md](../../specs/local-speech.md)

### SC-04-F02 — Translation and independent editing

**partial** · Owners: speech, subtitles

Delivered slice: Explicit local bilingual CTranslate2/SentencePiece adapter; captured source/languages/model/rules, complete timed draft, ID-based paginated comparison, default manual keep and confirmed replacement. Existing queue/cancellation; controlled SDK native tests.

Remaining: Real translation quality/model licenses, cross-cue context/model glossary, persistent presets/drafts and batch/Automation stages.

Authority: [specs/editor.md](../../specs/editor.md), [specs/local-speech.md](../../specs/local-speech.md), [specs/local-translation.md](../../specs/local-translation.md)

### SC-04-F03 — Speech generation and independent voice text

**partial** · Owners: speech

Delivered slice: Independent spoken text plus explicit local preset voice/model/language setup; bounded CPU synthesis on the existing queue; captured text/clocks, cancellable child, hashed natural WAV and JSON receipt, audition/manual review and native export with post-dialog stale checks. No automatic document or soundtrack edits.

Remaining: Actual model/runtime/voice rights and EN/VI quality evidence; segment alignment/mixing, durable Library/project/batch/Automation speech artifacts, resource budgets and installed UI acceptance.

Authority: [specs/editor.md](../../specs/editor.md), [specs/settings.md](../../specs/settings.md), [specs/local-speech.md](../../specs/local-speech.md), [specs/local-synthesis.md](../../specs/local-synthesis.md)

### SC-04-F04 — Voice and subtitle alignment

**planned** · Owners: speech, editor

Delivered slice: No implementation in this release.

Remaining: Segment-based alignment, length/rate/pauses, manual correction and full-duration mixing. Lip-sync is not committed.

Authority: [specs/editor.md](../../specs/editor.md)

### SC-04-F05 — Language independence and quality

**partial** · Owners: speech, localization

Delivered slice: Explicit STT and translation content languages remain independent of UI EN/VI. Translation requires the configured direction; no fallback. Captured source/model/runtime/rules are retained. TTS declares VI/EN independently; configured preset voices and a bilingual normalizer are explicit, not a guaranteed language/accent lock.

Remaining: Real language/terminology/completeness evidence, voice rights, resource/provider policy and installed EN/VI playback.

Authority: [BUSINESS_SCOPE.md](../../BUSINESS_SCOPE.md), [specs/screens.md](../../specs/screens.md), [specs/local-speech.md](../../specs/local-speech.md), [specs/local-translation.md](../../specs/local-translation.md), [specs/local-synthesis.md](../../specs/local-synthesis.md)

### SC-04-F06 — Downstream invalidation

**partial** · Owners: speech, projects

Delivered slice: Upstream changes invalidate dependent copies and generated translations without overwriting words. Source changes reject old translation drafts; target-only changes permit new review. Keeping manual edits retains translation provenance; common clock edits rebase references. Spoken token/text/timing/language changes invalidate voice review/export; displayed-only edits do not. Source is checked again after native save selection.

Remaining: Durable audio/alignment dependency graph, full speech pipeline restart and resource lifecycle.

Authority: [specs/editor.md](../../specs/editor.md), [specs/local-speech.md](../../specs/local-speech.md), [specs/local-translation.md](../../specs/local-translation.md), [specs/local-synthesis.md](../../specs/local-synthesis.md)


## SC-05

### SC-05-F01 — Substantial cue authoring

**partial** · Owners: subtitles, editor

Delivered slice: Four independent timed layers share selected-layer cue editor/timeline, import, rules, bulk timing and atomic undo. Provenance, explicit copy/review and composition clock mapping retain independent words.

Remaining: Reusable rule chains, larger-track performance and installed complete keyboard/IME/accessibility acceptance.

Authority: [specs/editor.md](../../specs/editor.md), [specs/local-speech.md](../../specs/local-speech.md)

### SC-05-F02 — Scoped subtitle formatting

**partial** · Owners: subtitles, editor

Delivered slice: Global or one-cue full appearance: font family, size, text/outline/box colors, outline/shadow, box opacity, 9-way placement, margins, character spacing, bold/italic; inherit/reload/apply and retained undo.

Remaining: Multi-cue style application, advanced typography/line spacing, presets/font management and owner-run rendered visual acceptance.

Authority: [specs/editor.md](../../specs/editor.md)

### SC-05-F03 — Creation, SRT and burned output

**partial** · Owners: subtitles, vision, speech

Delivered slice: Selected transcript/translated/spoken/displayed layers can export SRT or ASS with source/composition or output-clock timing. Burning video remains display-only; other layers are not implicitly applied.

Remaining: Durable typed speech-sidecar asset roles, font policy and coordinated multi-artifact export transactions.

Authority: [specs/editor.md](../../specs/editor.md), [specs/local-vision.md](../../specs/local-vision.md), [specs/local-speech.md](../../specs/local-speech.md)

### SC-05-F04 — Layer-aware text rules

**partial** · Owners: subtitles, speech

Delivered slice: Existing selected-layer literal/regex/timing edits remain previewed. Translation additionally captures bounded ordered literal postprocessing rules, applied only to generated target text, with provenance.

Remaining: Persistent reusable rule chains, model-side terminology conditioning and installed IME/visual/performance acceptance.

Authority: [specs/editor.md](../../specs/editor.md), [specs/local-speech.md](../../specs/local-speech.md), [specs/local-translation.md](../../specs/local-translation.md)

### SC-05-F05 — Synchronization and edit protection

**partial** · Owners: subtitles, projects

Delivered slice: Selected table/timeline share cues. STT and translation are separate reviewable drafts. Translation keeps existing manual cues by default and guards explicit replacement; composition maps all layer clocks and render remains display-only. Natural speech drafts are separate, manually auditioned artifacts and never replace words or soundtrack.

Remaining: Real synthesized-voice alignment and complete installed playback/selection acceptance.

Authority: [specs/editor.md](../../specs/editor.md), [specs/local-speech.md](../../specs/local-speech.md), [specs/local-translation.md](../../specs/local-translation.md), [specs/local-synthesis.md](../../specs/local-synthesis.md)


## SC-06

### SC-06-F01 — Manual region versus automatic removal

**partial** · Owners: vision, processing

Delivered slice: Distinct fixed-region and automatic text removal; automatic mode has no mandatory region review.

Remaining: Moving/time-varying targets and robust temporal masks.

Authority: [specs/local-vision.md](../../specs/local-vision.md), [specs/local-processing.md](../../specs/local-processing.md)

### SC-06-F02 — Detection, tracking and inpainting

**partial** · Owners: vision

Delivered slice: Local OCR/LaMa worker seams and normalized fixed masks.

Remaining: Tracking, complex backgrounds, flicker/distortion and verified model quality/license coverage.

Authority: [specs/editor.md](../../specs/editor.md)

### SC-06-F03 — Full-duration processing and resources

**partial** · Owners: vision, processing

Delivered slice: Chunked full-video removal, source-audio encode and cancellation.

Remaining: Beyond 960-pixel longest edge/24-fps review output, memory/speed benchmarks and full-resolution delivery.

Authority: [specs/local-processing.md](../../specs/local-processing.md)

### SC-06-F04 — Authorization and redistribution licensing

**partial** · Owners: vision, runtime

Delivered slice: No access-control bypass or automatic model download.

Remaining: Authorized-content and model/native redistribution verification on real deployments.

Authority: [BUSINESS_SCOPE.md](../../BUSINESS_SCOPE.md)


## SC-07

### SC-07-F01 — One shared job system across stages

**partial** · Owners: batch, processing

Delivered slice: Durable queue used by Editor rendering, manual batch, folder intake and saved workflow admission.

Remaining: Download, speech, classification and publishing stage support in the same system.

Authority: [specs/batch-jobs.md](../../specs/batch-jobs.md), [specs/automation.md](../../specs/automation.md)

### SC-07-F02 — Per-job control and progress

**partial** · Owners: batch

Delivered slice: Real render progress, pause/resume, cancellation and retry with persistent errors.

Remaining: Stage-level selective retry, progress and failure-isolation policies for the expanded pipeline.

Authority: [specs/batch-jobs.md](../../specs/batch-jobs.md)

### SC-07-F03 — Restart, crash recovery and idempotency

**partial** · Owners: batch, automation

Delivered slice: Saved queue, interrupted state and replayable workflow admission IDs.

Remaining: Production crash matrix, cross-stage checkpoints, charges/posts and approved recovery policies.

Authority: [specs/execution-policy.md](../../specs/execution-policy.md)

### SC-07-F04 — Content/recipe validity

**partial** · Owners: processing, runtime

Delivered slice: Existing cache includes source/subtitle/soundtrack bytes, edited recipe and renderer revision; soundtrack is rechecked on cache hits and before publishing. Batch finished files are linked only after matching the queued output hash.

Remaining: Whole-graph selective invalidation, resumable independent AI stage outputs and complete stage lineage.

Authority: [specs/local-processing.md](../../specs/local-processing.md)

### SC-07-F05 — Manual batch and autonomous policy

**partial** · Owners: batch, accounts

Delivered slice: Manual batch is distinct from developer-gated workflow execution.

Remaining: Approved Free/Plus limits, entitlements and commercial execution policy; no invented prices.

Authority: [specs/execution-policy.md](../../specs/execution-policy.md)


## SC-08

### SC-08-F01 — Flexible source selection

**partial** · Owners: automation, folders, downloads

Delivered slice: Saved workflows accept concrete Library selections; developer folder intake exists.

Remaining: Dynamic Library filters and supported remote source/link/channel intake.

Authority: [specs/automation.md](../../specs/automation.md)

### SC-08-F02 — Manual, new-content and scheduled triggers

**partial** · Owners: automation, folders

Delivered slice: Explicit manual admission and developer local folder watching.

Remaining: Product scheduler, polling, timezone/catch-up, intake defaults and trigger contracts.

Authority: [specs/automation.md](../../specs/automation.md)

### SC-08-F03 — Configurable steps and independent endpoints

**partial** · Owners: automation, processing, downloads, content-analysis, distribution

Delivered slice: Optional OCR/removal or plain local render/export; no required profile or affiliate setup.

Remaining: Download-only, extraction-only, classification-only and authorized publishing endpoints.

Authority: [specs/automation.md](../../specs/automation.md)

### SC-08-F04 — Saved configuration and immutable run inputs

**partial** · Owners: automation, profiles

Delivered slice: Saved workflows, revisions, profile application, model fingerprints, input snapshots and run history.

Remaining: General step graph, templates, explicit update/override policy and all stage dependencies.

Authority: [specs/automation.md](../../specs/automation.md)

### SC-08-F05 — Fixed/label routing and multiple matches

**planned** · Owners: automation, taxonomy, distribution

Delivered slice: No implementation in this release.

Remaining: Allowed-destination matching, priority/rotation/all-authorized modes, explicit no-match behavior and stable allocation.

Authority: [specs/automation.md](../../specs/automation.md)

### SC-08-F06 — Side-effect-free rule test

**planned** · Owners: automation

Delivered slice: No implementation in this release.

Remaining: Dry-run trace using valid existing evidence, never hidden OCR, post creation, billing or publishing.

Authority: [specs/automation.md](../../specs/automation.md)

### SC-08-F07 — Workflow/run/rule monitoring

**partial** · Owners: automation, batch

Delivered slice: Saved local workflows and runs linked to the existing queue, including per-job results and controls.

Remaining: Routing editor, per-stage run detail and concrete post/workflow/run navigation.

Authority: [specs/automation.md](../../specs/automation.md)

### SC-08-F08 — Plus local execution and lifecycle

**partial** · Owners: automation, accounts

Delivered slice: Developer execution gate retained without pretending to validate Plus.

Remaining: Approved entitlement, permission, offline, sleep, expiry, reconciliation and missed-schedule policy.

Authority: [specs/execution-policy.md](../../specs/execution-policy.md)


## SC-09

### SC-09-F01 — OCR to evidence-backed classification

**planned** · Owners: content-analysis, vision

Delivered slice: No implementation in this release.

Remaining: Independent OCR-to-analysis-to-category/tag branch with product/topic evidence, not exact identity claims.

Authority: [specs/content-analysis.md](../../specs/content-analysis.md)

### SC-09-F02 — Corrections, uncertainty and multiple products

**planned** · Owners: content-analysis, taxonomy

Delivered slice: No implementation in this release.

Remaining: Manual correction, conflicting evidence, multi-product handling and uncertainty policies.

Authority: [specs/content-analysis.md](../../specs/content-analysis.md)

### SC-09-F03 — Shared in-context labels

**partial** · Owners: taxonomy, library, distribution

Delivered slice: One persisted catalog; labels created/selected on videos, channels and links; stable IDs.

Remaining: Taxonomy merge/delete, automatic creation and uncertainty policies remain open.

Authority: [specs/content-analysis.md](../../specs/content-analysis.md), [specs/settings.md](../../specs/settings.md)

### SC-09-F04 — Manual Shopee inventory

**partial** · Owners: distribution, taxonomy

Delivered slice: Manually entered names and HTTPS URLs, preserved tracking parameters, labels and archival state.

Remaining: Optional URL resolution/product availability checks need consent; no crawling/link conversion.

Authority: [specs/channels-affiliate.md](../../specs/channels-affiliate.md)

### SC-09-F05 — Reverse usage per destination post

**partial** · Owners: distribution

Delivered slice: Reverse draft-post list and count from shared post records; one destination per post; edits retain URL snapshots.

Remaining: Published/accepted platform state filters and approved deleted/cancelled usage policy.

Authority: [specs/channels-affiliate.md](../../specs/channels-affiliate.md)

### SC-09-F06 — Evidence reused by conditions

**planned** · Owners: content-analysis, automation

Delivered slice: No implementation in this release.

Remaining: Use existing valid labels/metadata or preceding analysis without unnecessary AI; broad category is not exact product proof.

Authority: [specs/content-analysis.md](../../specs/content-analysis.md), [specs/automation.md](../../specs/automation.md)


## SC-10

### SC-10-F01 — Multiple channel configuration

**partial** · Owners: distribution, taxonomy

Delivered slice: Local YouTube/Facebook Page records with editable names, URLs, shared labels and archive state.

Remaining: Remote account connections and verified permission metadata.

Authority: [specs/channels-affiliate.md](../../specs/channels-affiliate.md)

### SC-10-F02 — Connection, management and publishing access

**partial** · Owners: distribution, accounts

Delivered slice: Local records explicitly stay not connected and cannot publish.

Remaining: OAuth, token storage/refresh/revoke, scopes and independently verified management/publishing capability.

Authority: [specs/channels-affiliate.md](../../specs/channels-affiliate.md)

### SC-10-F03 — Configuration, Published and Upcoming views

**partial** · Owners: distribution

Delivered slice: Channel detail navigation to local drafts/planned drafts and an explicitly empty Published view.

Remaining: Remote and Automation-origin published records, schedules and readback coverage.

Authority: [specs/channels-affiliate.md](../../specs/channels-affiliate.md)

### SC-10-F04 — Concrete post and schedule data

**partial** · Owners: distribution, automation

Delivered slice: One destination draft with frozen export hash, links and optional planned instant/timezone. Planned drafts do not execute.

Remaining: Automation/rule/run origin and local-versus-platform schedule execution/reconciliation.

Authority: [specs/channels-affiliate.md](../../specs/channels-affiliate.md)

### SC-10-F05 — Selection preservation and counting

**partial** · Owners: distribution

Delivered slice: Draft edits preserve destination/export/link snapshots; cancelled drafts retain history and visible usage.

Remaining: Submission idempotency, concurrent routing allocation and retry/reconciliation after unknown outcomes.

Authority: [specs/channels-affiliate.md](../../specs/channels-affiliate.md)

### SC-10-F06 — Verified publishing outcomes

**planned** · Owners: distribution

Delivered slice: No implementation in this release.

Remaining: Platform upload, format/quota/link placement, scheduling, readback and distinct uploaded/accepted/published states.

Authority: [specs/channels-affiliate.md](../../specs/channels-affiliate.md)

### SC-10-F07 — External history and freshness

**partial** · Owners: distribution

Delivered slice: Local-only coverage is disclosed; no fabricated live or complete history.

Remaining: External posts/schedules, last-reconciled timestamps and remote edits/deletion policy remain open.

Authority: [specs/channels-affiliate.md](../../specs/channels-affiliate.md)


## SC-11

### SC-11-F01 — Three Settings groups and Advanced

**partial** · Owners: settings

Delivered slice: General, AI & processing, Account and collapsed Advanced; default output directory and local model configuration.

Remaining: Functional account and resource controls; presentation does not drop technical scope.

Authority: [specs/settings.md](../../specs/settings.md)

### SC-11-F02 — Contextual model lifecycle

**partial** · Owners: settings, vision, accounts

Delivered slice: Selected local manifest, checksum validation, cancellation and missing-model feedback.

Remaining: Purpose/size/download actions, install/update/remove lifecycle and hardware-compatible recommendations.

Authority: [specs/settings.md](../../specs/settings.md)

### SC-11-F03 — Premium service choice and costs

**planned** · Owners: settings, accounts, speech

Delivered slice: No implementation in this release.

Remaining: Step-local service choice, cost visibility and consent; no silent paid/cloud fallback or separate AI BYOK tier.

Authority: [specs/settings.md](../../specs/settings.md), [specs/execution-policy.md](../../specs/execution-policy.md)

### SC-11-F04 — Hardware, resources, cache and diagnostics

**partial** · Owners: runtime, settings

Delivered slice: Worker runtime diagnostics and bounded local processing.

Remaining: CPU/GPU evaluation, concurrency budgets, user-consented cache cleanup and supported hardware verification.

Authority: [specs/settings.md](../../specs/settings.md)

### SC-11-F05 — Sensitive-data protection

**partial** · Owners: accounts, runtime

Delivered slice: Narrow IPC verbs, source-path authority and no token entry in local catalog records.

Remaining: Secure cookie/token storage, permissions and credential lifecycle; no automatic secret upload.

Authority: [specs/settings.md](../../specs/settings.md)

### SC-11-F06 — Account, Plus, credits and settlement

**planned** · Owners: accounts

Delivered slice: No implementation in this release.

Remaining: Approved account/billing contract, reservations/debits/refunds/expiry and local/paid execution gates. Prices and commercial defaults remain unapproved.

Authority: [specs/execution-policy.md](../../specs/execution-policy.md)

### SC-11-F07 — Shared labels and defaults

**partial** · Owners: taxonomy, settings

Delivered slice: In-context labels and persisted output/model defaults without onboarding prerequisite.

Remaining: Full default precedence, model evolution and background-execution policies remain open.

Authority: [specs/settings.md](../../specs/settings.md)


## SC-12

### SC-12-F01 — Off-device compute versus orchestration

**planned** · Owners: cloud

Delivered slice: No implementation in this release.

Remaining: Later extension for heavy computation and scheduler infrastructure; local automation has no cloud prerequisite.

Authority: [BUSINESS_SCOPE.md](../../BUSINESS_SCOPE.md), [specs/automation.md](../../specs/automation.md)

### SC-12-F02 — Data, authorization and consent

**planned** · Owners: cloud, accounts

Delivered slice: No implementation in this release.

Remaining: Hybrid steps require available data and authorization; desktop-only discovery does not become cloud discovery and cookies are not uploaded by default.

Authority: [BUSINESS_SCOPE.md](../../BUSINESS_SCOPE.md)

### SC-12-F03 — Storage, synchronization and placement

**planned** · Owners: cloud

Delivered slice: No implementation in this release.

Remaining: Retention, costs, placement, cross-device recovery and infrastructure contracts remain open.

Authority: [BUSINESS_SCOPE.md](../../BUSINESS_SCOPE.md)


## SC-13

### SC-13-F01 — Independent OCR extraction

**partial** · Owners: vision

Delivered slice: Whole-source OCR endpoint independent of trim, rendering, removal, STT, translation and TTS; bounded chunks preserve source/model fingerprints and explicit draft application.

Remaining: Actual-model quality, language acceptance and downstream classification integration.

Authority: [specs/local-vision.md](../../specs/local-vision.md), [specs/editor.md](../../specs/editor.md)

### SC-13-F02 — Timing, deduplication and SRT sidecar

**partial** · Owners: vision, subtitles

Delivered slice: Merged adjacent OCR cues across chunk boundaries, retained raw chunk evidence and independent whole-source SRT export; full scan verified through actual worker/FFmpeg with controlled OCR SDK.

Remaining: Scene-text output and complete OCR/STT layer conflict policy; no actual OCR accuracy claim.

Authority: [specs/editor.md](../../specs/editor.md)

### SC-13-F03 — Analysis-oriented extraction

**planned** · Owners: vision, content-analysis

Delivered slice: No implementation in this release.

Remaining: Automatic extraction for classification without region-review gates, exact-product assumptions or forced subtitle editing.

Authority: [specs/content-analysis.md](../../specs/content-analysis.md)


## SC-14

### SC-14-F01 — Canonical English documentation

**partial** · Owners: localization

Delivered slice: Single English scope/spec/contract set and EN/VI UI resources.

Remaining: Keep new specifications canonical rather than parallel translated copies.

Authority: [specs/screens.md](../../specs/screens.md)

### SC-14-F02 — Bilingual application coverage

**partial** · Owners: localization

Delivered slice: EN/VI messages for current five areas, catalog/profile/workflow forms and common errors.

Remaining: Unbuilt flows, account/credits/model setup and real screenshots in both locales.

Authority: [specs/screens.md](../../specs/screens.md)

### SC-14-F03 — Independent UI/content/voice/timezone

**partial** · Owners: localization, taxonomy, distribution

Delivered slice: UI locale does not rewrite user labels, URLs, recipes, planned post instants or stored text.

Remaining: Speech-language separation and complete scheduled execution checks.

Authority: [specs/screens.md](../../specs/screens.md)

### SC-14-F04 — Keyboard, IME and responsive states

**partial** · Owners: localization

Delivered slice: Astryx controls and retained specialist/native media seams; no raw control library.

Remaining: Actual installed-library focus, keyboard, IME, long-label, screen-reader and target-OS checks.

Authority: [specs/screens.md](../../specs/screens.md)

## Cross-module flows

### FLOW-01 — Local Library to exact edit/export

**partial** · SC-01, SC-02, SC-03, SC-05 · Owners: library, editor, projects, subtitles

Import local media → Open source or exact linked project → Arrange clips / edit captions → Render requested sample or full output → Save project / SRT / ASS / MP4 → Retain known Library member links

Remaining: Independent timed text layers, direct composition edit/export and known member links exist. Complete Library derivation graph, generated voice and installed format/visual acceptance remain.

### FLOW-02 — Reference, copy, duplicate reuse and relocation

**partial** · SC-02 · Owners: library, runtime

Choose reference or copy → Compare content identity → Reuse or deliberate separate entry → Relink only matching source bytes

Remaining: Retention, remote identity and graph relocation policies.

### FLOW-03 — Direct editing without Library or profile

**partial** · SC-03, SC-05 · Owners: editor, projects, profiles

Open local video or project → Configure directly → Preview sample → Save requested output

Remaining: Direct multi-clip editing stays independent of Library/profiles. Layered tracks, speech layers and owner-run native UI acceptance remain.

### FLOW-04 — Download-only completion

**planned** · SC-01, SC-08 · Owners: downloads, batch, automation

Connect authorized source → Parse URL/share/profile → Inspect/filter available candidates → Download selection to chosen folder → Finish without AI or publishing

Remaining: All external-download execution remains planned; never force a render endpoint.

### FLOW-05 — User-started Library batch

**partial** · SC-02, SC-07 · Owners: library, batch, processing, profiles

Select Library items → Stage existing queue draft → Configure directly or apply profile → Choose output → Enqueue → Start/control queue → Inspect/reveal results

Remaining: Download/speech/analysis/publishing stages and complete stage recovery.

### FLOW-06 — Standalone OCR to subtitle file

**partial** · SC-13, SC-05 · Owners: vision, subtitles

Select video → Extract automatically without removal/STT → Review/edit only when desired → Export SRT without burning video

Remaining: Whole-source draft and direct SRT export are implemented. Actual-model quality, scene text and combined-output transaction remain open.

### FLOW-07 — Independent manual or automatic text removal

**partial** · SC-06 · Owners: vision, processing, editor

Choose manual fixed region or automatic target → Preview sample → Process entire video → Preserve source and audio → Inspect output

Remaining: Single-source OCR/removal remains; composition AI is explicitly unsupported. Full-resolution output, tracking and real-model quality remain.

### FLOW-08 — Independent speech localization stages

**partial** · SC-04, SC-05 · Owners: speech, subtitles, editor

Recognize timed speech → Edit source → Translate/edit → Edit separate TTS text → Explicit voice generation → Align/correct → Export

Remaining: STT, four text layers, reviewed translation and natural preset-voice WAV/receipt review/export are implemented. Segment alignment, full-duration mixing, durable speech workflow admission and actual model/language quality remain; controlled SDK tests do not establish voice quality.

### FLOW-09 — OCR to classification without subtitle pipeline

**planned** · SC-09, SC-13 · Owners: vision, content-analysis, taxonomy, library

Extract evidence → Suggest category/product type/tags → Correct uncertainty/multiple products → Store labels/evidence → Use in Library/conditions

Remaining: Classification executor and evidence contract remain missing.

### FLOW-10 — Labels in context and routing dry run

**partial** · SC-09, SC-10, SC-11, SC-08 · Owners: taxonomy, library, distribution, automation

Create/select shared labels on video/link/channel → Configure allowed candidates → Dry-run matching → Inspect reasons without side effects

Remaining: Label assignment is implemented; routing, priority/rotation/all-authorized and no-match dry run remain missing.

### FLOW-11 — Flexible automation source to selected endpoint

**partial** · SC-08 · Owners: automation, folders, downloads, processing, content-analysis, distribution

Choose source and trigger → Set conditions → Choose only required steps → Optional profile → Selected endpoint → Run history

Remaining: Local manual Library render and developer folders only; flexible non-render endpoints, source filters and production scheduler remain missing.

### FLOW-12 — Per-destination publishing and reconciliation

**planned** · SC-10, SC-08 · Owners: automation, distribution, accounts

Authorized routing → Freeze destination/export/link and origin → Create concrete post → Submit → Reconcile remote result → Mark published only on confirmation

Remaining: Local manual drafts exist; no Automation-origin public publishing or reconciliation.

### FLOW-13 — Reusable profile without per-video edits

**partial** · SC-03 · Owners: profiles, processing, editor, batch, folders, automation

Save reusable processing recipe → Export/import versioned profile → Explicitly apply a copy → Continue editing → Run only by separate action

Remaining: Reusable global subtitle appearance joins the existing processing profile; per-video music, trim and cue overrides remain excluded. Speech/rule/composition presets and complete portability remain.

### FLOW-14 — Interrupted workflow admission and queue recovery

**partial** · SC-07, SC-08 · Owners: automation, batch, runtime

Capture run/input/model versions → Persist prepared run → Admit existing queue using same ID → Resume interrupted admission → Observe same jobs

Remaining: Production crash matrix and stage-level external/paid settlement; missing jobs are not reported complete.

### FLOW-15 — Changed content invalidates stale results

**partial** · SC-02, SC-07 · Owners: runtime, processing, projects

Fingerprint source/settings → Process/cache → Detect changed bytes or recipe → Refuse stale reuse → Rebuild affected result

Remaining: All clip bytes/durations and composition/canvas/interval participate in validation; music/style/edit identities remain. Complete stage dependency invalidation and automatic missing-asset repair remain.

### FLOW-16 — Contextual component and service setup

**partial** · SC-11 · Owners: settings, accounts, vision, speech

Start available work → Encounter missing dependency → Explain purpose/size/cost → User installs/selects service → Validate readiness → Explicit run

Remaining: Explicit local vision and speech manifest checks exist. Runtime/weight installation, verified model download/update and premium-service setup remain separate work.

### FLOW-17 — Plus, credits and lifecycle gates

**planned** · SC-07, SC-08, SC-11 · Owners: accounts, runtime, automation

Evaluate affected step entitlement/cost → Confirm/reserve when approved → Execute or pause affected work → Reconcile settlement and recovery

Remaining: Commercial defaults remain proposals; no fabricated balance, pricing or implicit paid fallback.

### FLOW-18 — Consented hybrid execution

**planned** · SC-12 · Owners: cloud, accounts, runtime

Select eligible remote steps → Explain data transfer → Obtain consent → Check assets/authorization → Execute → Reconcile retention/results

Remaining: All cloud work remains a later extension; no implicit cookie transfer or desktop-off discovery.

### FLOW-19 — Locale changes preserve business meaning

**partial** · SC-14 · Owners: localization, taxonomy, distribution, automation

Switch English/Vietnamese → Localize controls/errors/date display → Retain user content, IDs, voice languages and scheduled instants

Remaining: Real EN/VI interaction checks and unbuilt service/speech flows.

### FLOW-20 — Dependency-aware non-destructive removal

**partial** · SC-02, SC-10 · Owners: library, distribution, automation

Inspect source/generated/post/workflow references → Show affected scope → Remove Library entry only when safe → Keep original and history

Remaining: Separate original/generated/cache deletion, archive/recovery policy and override approval.

### FLOW-21 — Project autosave and editing recovery

**partial** · SC-03 · Owners: projects, editor

Edit project → Recoverable autosave → Restart/crash → Inspect recovered version → Resolve missing/changed media → Resume editing

Remaining: Recovery retains whole applied composition and all dependencies. Opening reauthorizes each distinct clip/music source; cancelled or changed input preserves the current editor. Anchor-independent repair and owner-run crash/close acceptance remain.

### FLOW-22 — Full video/audio/subtitle editing

**partial** · SC-03, SC-04, SC-05 · Owners: editor, subtitles, speech

Arrange/transform clips → Edit independent text layers → Apply scoped styles/rules → Sync timing/voice → Preview → Export

Remaining: Hard-cut composition, soundtrack, independent text layers, STT, translation, natural speech draft review/export and scoped display style exist. Aligned voice integration, transitions/layered media, advanced typography and installed visual/keyboard/media acceptance remain.

### FLOW-23 — Channel and affiliate reverse navigation

**partial** · SC-09, SC-10 · Owners: distribution

Configure channel/link → Select registered export → Save per-destination draft → Inspect Upcoming/Published coverage → Open link usage and same post/export

Remaining: Local draft schedules do not execute; published and external history remain empty/unavailable until verified.

### FLOW-24 — Watcher continues waiting after each item

**partial** · SC-08, SC-07 · Owners: folders, automation, batch

Choose explicit first-run scope → Watch source folder → Wait for stable file → Admit shared queue → Finish item → Keep watcher waiting

Remaining: Developer gate, product lifecycle/Plus policy and remote/scheduled triggers.

## Acceptance and policy

Specification acceptance lists remain authoritative. Traceability validates coverage and ownership, not execution or acceptance-test completion.

- [specs/screens.md](../../specs/screens.md)
- [specs/sources-library.md](../../specs/sources-library.md)
- [specs/editor.md](../../specs/editor.md)
- [specs/content-analysis.md](../../specs/content-analysis.md)
- [specs/automation.md](../../specs/automation.md)
- [specs/channels-affiliate.md](../../specs/channels-affiliate.md)
- [specs/settings.md](../../specs/settings.md)
- [specs/execution-policy.md](../../specs/execution-policy.md)
- [specs/local-speech.md](../../specs/local-speech.md)

Open decisions are not defaults: `DECISIONS.md`, `specs/execution-policy.md`, `specs/sources-library.md`, `specs/channels-affiliate.md`.
