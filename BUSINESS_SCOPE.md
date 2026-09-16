# Reupmatic — Business Scope

> Version: 1.8 · Updated: 2026-09-15 · Documentation language: English.
> Purpose: define the complete product scope, not a release plan or an implementation specification.

## 1. How to read this document

This scope combines the original product brief (`B`) and subsequent owner decisions. [DECISIONS.md](DECISIONS.md) records confirmed decisions (`D-*`), proposals (`P-*`), open questions (`Q-*`), and verification work (`R-*`). [AGENTS.md](AGENTS.md) defines how agents work with these documents.

**In scope does not mean fully specified, technically proven, or required in a single release.** The MVP, release sequence, exact dependency set, prices, and hardware matrix are not approved. D-40–D-41 fix the technology and reuse-first delivery direction, not a validated production stack. Do not silently remove affiliate, distribution, or automation to turn the product into a translation-only utility. Research items remain in the product vision without promises about quality or integration reliability.

English is the canonical language of this documentation package. The application must support **English and Vietnamese interfaces**; documentation language does not determine the UI or generated content language. See SC-14 and D-30–D-31.

## 2. Product, users, and value

A **macOS and Windows desktop application** for individual short-form video creators and affiliate marketers, including nontechnical users managing multiple Facebook Pages and YouTube channels.

The product reduces manual work across importing, organizing, editing, localizing, attaching affiliate links, and distributing videos. Inputs include **users' own videos** and third-party content they are authorized to download, edit, and distribute. Douyin is a priority connector, not an application entry requirement.

Two pillars must work well from the beginning:

- **Video processing, Vietnamese localization, and batch processing:** editing, OCR, speech recognition, translation, voice generation, subtitles, synchronization, and export.
- **Automation:** receive videos from folders, the Library, or connected sources; execute selected steps to selected outputs under configured schedules, conditions, and permissions. Profiles are optional. Progress, control, and recovery are part of the capability.

Do not promise affiliate revenue, monetization eligibility, or successful publishing to every platform. Value must be demonstrated through actual workflow outcomes. Sources: B §2, §7; D-01–D-04.

## 3. Three ways to use one system

| Mode | Conceptual business flow |
|---|---|
| Direct editing | Open a local/Library video or project → edit and preview as needed → process/export → distribute only when requested. |
| User-started batch | Select videos → configure processing directly or optionally apply a profile → run selected steps → inspect results → export/distribute as needed. |
| Automation | Source + trigger → configured conditions and steps → selected output → record results. An enabled watcher continues waiting for new content after an item finishes. |

These are not mandatory pipeline sequences. Download-only, processing-only, extraction/classification-only, and full publishing workflows are valid. A workflow is complete when it reaches **its configured endpoint**, not necessarily a published post (D-23–D-24).

The five navigation areas are task-oriented, not a wizard: **Sources & Library; Editor & Video Processing; Channels & Affiliate; Automation; Settings**. Their authoritative map is [specs/screens.md](specs/screens.md).

## 4. Functional scope

### SC-01 — Source intake and downloading

Local video import is a first-class path. Prioritize **Douyin** among external connectors; RedNote/Xiaohongshu remains an integration research target without a committed delivery date.

For supported sources, accept video URLs, channel/profile URLs, and share text containing a URL. Identify the source, obtain available metadata, show/filter candidates, and let users download selected videos. Filters may use publication date, likes, duration, and other fields actually available. Provide progress, queueing, cancellation, retries, duplicate protection, and destination settings.

The accepted Douyin direction is an authorized browser/headless session with user-supplied or user-approved cookies. Provide main connect/reconnect actions and advanced cookie entry. Session persistence, security, headed/headless behavior, pagination, and reliability still require verification. Do not promise complete channel history or unavailable metrics.

One-time Download selected is separate from Create automation from this source. Download-only finishes at the chosen folder without mandatory OCR, models, rendering, or publishing. Sources and Automation share download results and asset state. [specs/sources-library.md](specs/sources-library.md) owns this intake flow; Automation owns monitoring, rules, and execution. Sources: B §3.1–3.2; D-04/D-07/D-24/D-32; P-03; R-01/R-13.

### SC-02 — Library and content lifecycle

Manage original videos, source metadata, projects, transcripts, translations, subtitles, generated audio, exports, tags/categories, product analysis, affiliate associations, processing states, and distribution history.

Group related assets under content entries and open the exact project/export or analysis result. Support search/filtering, multi-select processing, independent analysis, manual labels, folder access, and post preparation. Multiple projects may use one original.

**Accepted defaults:** local import references the existing file, with optional Copy into Library and relinking of moved files. Existing content may be reused or deliberately imported/downloaded again; filename equality alone is not identity. Separate Library removal, project/generated-asset deletion, cache cleanup, and original deletion, with affected projects/pending posts shown before file-affecting actions. Detailed identity, retention, collision, and irreversible-deletion policies remain open. Sources: D-33–D-36; B §3.2; Q-04; [specs/sources-library.md](specs/sources-library.md).

### SC-03 — Editor and reusable profiles

Baseline tools: trim, split, crop, aspect ratio, flip, basic color adjustments, preview, and export. Joining/reordering clips, speed changes, audio controls/replacement, voiceover, and platform output presets still need detailed behavior; a minimal wireframe does not remove them. Subtitle editing is specified separately under SC-05.

Learn interaction patterns from CapCut desktop and DaVinci while keeping the product simpler, without weakening required tools. Specify the media panel, preview, timeline, inspector, undo/redo, autosave, recovery, and export. Preview must show actual processing results during repeated adjustments **without rendering the entire video after every change**. Sample rendering, caching, and responsiveness remain design/benchmark work (P-09/R-07).

Profiles optionally save/apply/import/export reusable processing configuration: transforms, export settings, languages, voices, subtitle styles, and text rules. Creating or loading a profile is never a prerequisite. Distinguish a reusable recipe from per-video text, timing, masks, and edits. Format, versioning, dependencies, overrides, and workflow update behavior are open. Sources: B §3.4, §5; D-08, D-13–D-15; Q-01.

### SC-04 — STT, translation, TTS, and alignment

Keep speech-to-text, translation/editing, text-to-speech, and time alignment separate. Priority source languages are Chinese and English; priority output languages are Vietnamese and English. Users' Vietnamese source videos remain valid. Interface language is independent of these settings.

Transcripts have timestamps and are editable. Address segmentation, punctuation, names, terminology, and downstream invalidation after edits. Offer local/free options and app-provided premium services under Free/Plus; no model or provider is selected.

Evaluate segment-based synchronization, translation length adjustment, speaking rate, pauses, and manual correction. Subtitle alignment, voiceover alignment, and lip-sync are different capabilities; lip-sync is not committed. Sources: B §3.6–3.7; Q-01, Q-03; R-04.

### SC-05 — Subtitle editing and text rules

Provide a substantial subtitle-editing workspace inside the Editor: direct text/time editing, add/delete/split/merge, bulk timing adjustments, source/translation comparison, and synchronized selection with the timeline and preview. Include presets and scoped formatting for font, size, color, outline, shadow, background/opacity, position, text width, line breaks, and spacing.

Create subtitles manually, from OCR/STT, or by importing SRT. Export a subtitle file, burn subtitles into video, or produce both. Display text and TTS text are independently editable. Typing must not generate speech or spend credits; new AI results must not silently overwrite manual edits. Manual editing is not a mandatory batch/automation checkpoint.

Text replacement rules, including advanced regex, must identify the affected layer: source transcript, translation, TTS input, or displayed subtitle. Provide preview and undo. Synchronization after trim, speed changes, text edits, or voice regeneration needs explicit behavior. The authoritative subtitle specification is [specs/editor.md](specs/editor.md) §10. Sources: D-19–D-21; B §3.8; Q-01.

### SC-06 — Removing burned-in text and watermarks

Support **manual fixed-region selection** and **fully automatic processing**. Automatic mode finds the target and processes it without requiring users to add, remove, or approve detected regions. Manual mode is a separate path (D-16).

Detection and removal are separate technical problems. Evaluate fixed/moving targets, time-varying masks, tracking, complex backgrounds, temporal consistency, flicker, distortion, speed, memory, and redistribution licenses. No model, runtime, or quality guarantee is approved. Use only authorized content; removal is not a way to bypass ownership or access restrictions. Sources: B §2, §3.5; R-03/R-06.

### SC-07 — Batch, shared jobs, and recovery

Cover downloading, OCR, STT, translation, TTS, analysis, rendering, and publishing in one shared job system. Show step-level progress, cancellation/retry capabilities, and recovery after application closure/crashes. Determine which results remain valid when data or configuration changes.

Avoid unnecessary full reruns, duplicate charges, and duplicate posts. Per-item failure isolation and resuming from affected steps are proposals requiring detailed policies (P-04). User-started batch processing is distinct from autonomous workflow orchestration; its precise Free/Plus limits remain open (P-01). Sources: B §5; D-03; Q-01–Q-02.

### SC-08 — Flexible automation

Support local folders, Library selections/filters, and Douyin sources/links/channels, with manual, scheduled, or new-content triggers according to source capabilities. Connector verification still governs actual discovery/download support.

Users choose steps and endpoints: download to a folder, process/export videos, extract/classify content, or continue through affiliate routing and publishing. Download-only must not require OCR, AI models, rendering, affiliate links, or publishing channels. Configure processing directly or use an optional profile. Conditions can consume existing valid metadata/labels or preceding analysis results; unnecessary AI must not be inserted automatically.

Use understandable configuration blocks, templates, and rules rather than requiring a node canvas. [specs/automation.md](specs/automation.md) owns source/trigger behavior, dependencies, run monitoring, and **channel/link routing rules**. Accepted routing options include fixed selections or label-based matching, channel priority/rotation/all-authorized destinations, and explicit no-match behavior. These do not authorize unrestricted public posting.

Automation is a Plus capability and must support local execution from the beginning. Cloud orchestration is a later extension. Do not promise execution while the required local environment is unavailable. Schedule catch-up, intake defaults, retry counts, entitlement expiry, and charges remain open. [specs/execution-policy.md](specs/execution-policy.md) now proposes the cross-cutting gates, lifecycle, settlement, and recovery behavior; it does not approve those defaults. Sources: D-03, D-05–D-06, D-10, D-23–D-24, D-28–D-29; R-01/R-02/R-10.

### SC-09 — Content classification, products, and Shopee links

Provide **OCR → content analysis → category/tag assignment**, independently of subtitle editing, removal, translation, or rendering. Results support Library organization and affiliate/channel/workflow conditions. [specs/content-analysis.md](specs/content-analysis.md) owns this branch. A shared catalog with manual in-context label creation/selection is confirmed by D-39; initial taxonomy, automatic label creation, and uncertainty policies remain open under Q-09.

Research frames, OCR, transcripts, vision, and multimodal analysis for product/topic suggestions. Distinguish reading text, identifying a product type, and identifying an exact brand/model. Allow users to correct results and handle multiple products or conflicting evidence. Matching a broad category is not proof of an exact product match.

The current affiliate library contains **manually entered Shopee links**, manually tagged and categorized. Do not crawl Shopee products, enroll users in affiliate programs, create/convert affiliate URLs, or invent exact product matches. Show how many destination posts use a link and let users open those posts. Count posts, not retries, clicks, orders, or commissions. See [specs/channels-affiliate.md](specs/channels-affiliate.md). Sources: B §3.3, §4.1; D-09, D-22, D-26.

### SC-10 — Channels and distribution

Manage multiple **YouTube channels and Facebook Pages** with manually assigned tags/categories/groups and connection/API authorization settings. Distinguish connected, management access, and publishing capability. Platform account authorization is not a separate AI-provider BYOK plan.

A channel exposes **Configuration, Published, and Upcoming** views. Show concrete posts and schedules originating in Automation, with links to their exports, affiliate links, workflow/rule, and run. Automation, channel views, and affiliate usage read the same post/schedule data, not separately synchronized copies. One destination channel has its own post and publishing outcome; retries preserve that post's selected destination/link and do not inflate counts.

Posting requires platform-specific verification of authorization, token lifecycle, formats, permissions, quotas, link placement, reading status/history, and scheduling. Uploaded, scheduled, and confirmed published are not interchangeable. Coverage of posts created outside the application is open, not silently excluded or promised. Sources: D-25–D-29; B §4.2–4.3; R-02; Q-06.

### SC-11 — Settings, models, resources, and sensitive data

Settings has **three primary groups: General, AI & processing, and Account**. Keep technical resource/concurrency/cache/diagnostic controls in collapsed Advanced. This changes presentation, not the full processing or safety scope. [specs/settings.md](specs/settings.md) owns behavior and contextual setup (D-37–D-38).

Open the application and begin available work without a long setup wizard or installing every model. Prompt for required local components where needed, with purpose, size, and a Download action. Support suitable configuration recommendations and optional detailed model changes. Choose premium services at the processing step with cost visibility; do not silently fall back to paid/cloud processing. No separate AI BYOK product path (D-05/D-10).

Users create/select category/tag labels directly on videos, Shopee links, and channels through a shared catalog; Settings catalog setup is not required (D-39). Taxonomy details remain Q-09. Language follows SC-14; accounts/credits follow approved Q-05 policy.

Keep hardware/runtime compatibility checks, CPU-only evaluation, resource limits, failure handling, and protection of secrets. Simplification is not universal GPU support or permission to erase data/upload content. Model lifecycle, default precedence, background execution, and billing remain open. Sources: B §5–6; D-10, D-37–D-39; Q-03–Q-05/Q-08/Q-11; R-05/R-14.

### SC-12 — Later cloud execution and automation

Cloud is an accepted future extension for heavy computation and off-device orchestration/scheduling, not a prerequisite for local automation. Provider-hosted AI and our own worker/scheduler infrastructure are separate decisions.

A hybrid workflow can continue only where the required data and authorization are available. If Douyin depends on the desktop's session, cloud processing of uploaded videos does not imply discovery of new videos while that desktop is off. Do not upload session cookies by default.

Storage, synchronization, retention, consent, pricing, placement, and cross-device recovery remain open. Sources: D-06; P-06/P-08; Q-07–Q-08.

### SC-13 — Standalone OCR extraction

Extract video-frame text without requiring removal, audio recognition, translation, TTS, or rendering. Support both subtitle/text editing/export and content classification under SC-09. Automatic extraction must not require per-region review.

Timing, repeated-frame deduplication, OCR/STT conflicts, scene-text outputs, and quality need detailed specifications and benchmarks. Subtitle SRT support is confirmed; other text formats are open. Reading text does not establish exact product identity. Sources: D-16–D-17, D-21–D-22; P-11; R-06.

### SC-14 — English/Vietnamese application support

**Confirmed:** maintain the documentation in English and support both **English and Vietnamese** in the application (D-30–D-31). Localized UX covers all five areas and shared dialogs, statuses, errors, notifications, setup, and account/credit screens—not only the navigation labels.

UI language, source language, translation/output language, voice language, taxonomy labels, and scheduling timezone are separate concepts. Changing the UI language must not rewrite user content, alter rule identities, regenerate media, change credit values, or reschedule posts. Both English and Vietnamese output workflows remain in SC-04; model-specific quality is subject to R-04/R-09.

The authoritative cross-cutting design is **NAV-L10N** in [specs/screens.md](specs/screens.md). Proposed defaults, fallback, resource organization, and localization tests are identified there; exact first-launch behavior is still open under Q-10.

## 5. Free / Plus model

| Confirmed capability | Free | Plus |
|---|---|---|
| Local/free processing choices | Available | Retained |
| App-provided premium services | No included credits under the agreed model | Included credits |
| Workflow Automation access | No | Yes |
| Separate AI BYOK product path | Not included | Not included |

The name is **Plus**, not an additional Pro tier. Price, billing period, included balance, top-ups, rollover/expiry, reservation/debit/refund rules, limits, and expiry behavior are unapproved (Q-05).

Keeping user-started local batch in Free (P-01), charging no credits for entirely local automation and waiting only at paid steps when depleted (P-02), and a shared future cloud wallet (P-08) are **proposals**, not approved billing rules. Automation access never implies unlimited cloud resources. Do not add channel/link-count paywalls without approval. P-19–P-21 in [specs/execution-policy.md](specs/execution-policy.md) develop the depleted-credit, expired-Plus, offline, and interrupted-work policies for review; Q-05 remains unresolved.

## 6. Boundaries and non-promises

Only handle content and accounts the user is authorized to access and use. Do not bypass restrictions, silently disclose data, or publish outside granted permission.

Mobile apps, a web editor, team collaboration, a fully cloud-hosted product, and professional-editor feature parity are not default commitments. Do not promise exhaustive crawling, universal GPU support, perfect inpainting/lip-sync, verified affiliate attribution, or income.

Affiliate and distribution remain in scope. Bilingual UI must not be deferred into an undocumented English-only implementation. Unverified hardware, model, or platform assumptions must not become sales claims.

## 7. Success measures and remaining work

Measure operator time per batch, usable-output rate, manual correction effort, Vietnamese/English output quality and synchronization, recovery behavior, duplicate jobs/charges/posts, and cost per video. No quantitative baseline or acceptance threshold has been approved (Q-03/Q-05).

The package includes the screen map and all five areas, including simplified Settings, plus dedicated content-analysis behavior, at explicitly stated maturity levels. Detailed file-lifecycle policies, video/audio tools, preview defaults, model/default-setting lifecycle, billing, background execution, API verification, and architecture/contracts/build planning remain unfinished. Do not interpret this package as permission to guess every missing behavior.

**Revision 1.5:** adds Sources/Library flows, accepted reference-first import with optional copy, duplicate reuse choices, and separated deletion with dependency visibility. Earlier channel/routing, full Editor/subtitle, English documentation, bilingual UX, and open pricing/technical questions remain intact. No application tests or live integration benchmarks are claimed.

**Revision 1.6:** adds simplified three-group Settings with collapsed Advanced, contextual setup/service choice, and shared labels created at their point of use. No new credit, model, stack, or background-execution policy is approved by this update.

**Revision 1.7:** adds a cross-cutting execution/credit/lifecycle policy draft within the existing specs group, not another screen or product mode. Existing approved scope is unchanged. New rules remain proposals, and all 16 acceptance scenarios are unexecuted.

## Technology delivery constraint — D-40–D-41

Continue with Electron/React/TypeScript, Python production media/AI workers, and existing native libraries; no first-party Rust layer or Rust rewrite roadmap. Prefer reusable components and pipelines over rebuilding their functionality. Delivery effort, integration/packaging, maintenance, and license compatibility matter alongside performance. This does not remove video/audio/subtitle tools or approve every package: see [ARCHITECTURE.md](ARCHITECTURE.md) and [reuse evidence](research/reuse-audit.md).

## Integration naming and maintenance note

The owner named the application **Reupmatic** (D-42). Documentation remains English and application UX supports English/Vietnamese. D-43–D-44 add current-dependency maintenance and developer formatting/hooks; they do not alter the five task areas, Free/Plus rules, media capabilities, scope, or unresolved business policies.
