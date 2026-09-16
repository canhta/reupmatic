# Application Screen Map

> Package: 1.8 · Updated: 2026-09-15 · Language: English.
> Confirmed: five task areas, shared jobs, and English/Vietnamese application support.
> Detailed layouts/defaults remain proposed unless marked otherwise. This is not a complete module implementation spec.

## 1. Authority and identifiers

Read [BUSINESS_SCOPE.md](../BUSINESS_SCOPE.md) and [DECISIONS.md](../DECISIONS.md), especially D-18, D-25–D-36. `SCR-*` identifies a navigation area; `NAV-*` identifies shared navigation/UX behavior. Preserve these IDs in tasks and tests.

English is the documentation language, not a restriction on the interface. All screens follow **NAV-L10N** in §10. Module specs may illustrate English labels without repeating every Vietnamese translation.

## 2. NAV-01 — Five main areas · CONFIRMED

| ID | English label | Vietnamese label | Main content / scope |
|---|---|---|---|
| SCR-01 | Sources & Library | Nguồn & Thư viện | Downloads; Library. SC-01–SC-02. |
| SCR-02 | Editor & Video Processing | Editor & Xử lý video | Editing, subtitles, analysis, processing, batch. SC-03–SC-07, SC-13. |
| SCR-03 | Channels & Affiliate | Kênh & Affiliate | Channels; Shopee links; posts and schedules. SC-09–SC-10. |
| SCR-04 | Automation | Tự động hóa | Workflow list, configuration, and run history. SC-08 and connected capabilities. |
| SCR-05 | Settings | Cài đặt | General; AI & processing; Account. Collapsed Advanced retains resource/cache/diagnostic controls. SC-11, SC-14. |

These are task areas, **not a five-step wizard**. Users may open a local video directly in the Editor without connecting Douyin, creating a profile, or creating a workflow. Translated labels are working UI copy, not pixel-level approval.

**NAV-02 — Confirmed ownership:** Editor defines how content is processed. Automation defines when, for which content, and where results go. Settings owns application-wide defaults. One job queue is reachable everywhere; a sixth mandatory navigation area is not needed.

## 3. SCR-01 — Sources & Library

**Goal:** bring content into the application and find its related assets. Authoritative behavior: [sources-library.md](sources-library.md), D-32–D-36. Downloads does not replace local import; detailed file/runtime policies remain explicitly proposed/open.

| Component | Confirmed actions and responsibility | Boundary |
|---|---|---|
| Downloads | Paste supported URL/share text, discover available candidates, filter/select, choose folder, download. | No complete-channel guarantee or mandatory AI/rendering/publishing. |
| Source connections | Main connect/reconnect; cookie import in advanced options. | Source sessions stay here; storage/headless/verification implementation remains P-03/R-01. |
| One-time / Automation handoff | Download selected once, or explicitly open source-based workflow configuration. | Transferring settings does not enable a watcher or authorize a full-history crawl. |
| Library | Group originals/projects/generated assets/exports/labels/history; search/filter/multi-select/import. | One content entry is not one flattened list of every physical file. Exact identity/grouping remains SL-Q02. |
| Content detail | Open the selected project/export, text/audio/analysis, source path, related post/run. | Shared artifacts and posts, not duplicate records/calendars. |

**Confirmed:** local import references the file by default with optional copy and relink; report existing content and offer reuse or deliberate additional import. Multiple projects can use one original. Separate Library removal, project/generated-asset deletion, cache cleanup, and original deletion; show affected projects/pending posts before file-affecting actions. Identity algorithms, retention, recovery, and irreversible deletion remain SL-Q01–03/Q-04.

Library includes independent Analyze & classify and manual label actions; [content-analysis.md](content-analysis.md) owns analysis semantics. Source failure does not lock available local content. State/panel/filter details and collision behavior are SL-P01–05; all follow NAV-L10N.

## 4. SCR-02 — Editor & Video Processing

**Goal:** edit an individual video, preview actual processing on a sample, apply selected settings to a batch, and produce the selected outputs. [editor.md](editor.md) owns detailed behavior.

Entry points: local open/import, Library selection, saved project, or a job/result/error. Batch is part of this area, not a separate reduced Editor or compulsory Plus workflow.

**Confirmed:** optional import/export profiles; real preview without repeated full-video renders; manual/automatic removal; standalone OCR; independent category/tag analysis; and a substantial subtitle workspace supporting content/timing edits, SRT, and separate display/TTS text. Automatic processing must not require per-region or per-cue review.

**Proposed:** exports return to the Library; send a selected export to SCR-03 for post preparation or send processing settings to SCR-04 for workflow configuration. Navigation/configuration transfer does not grant paid/public-action permission. Preserve edits while switching tools/areas. See Editor §10 and Content Analysis for distinct outputs and lifecycles.

## 5. SCR-03 — Channels & Affiliate

**Goal:** configure publishing destinations and manually entered Shopee links, inspect concrete posts/schedules, and trace link usage. Authoritative behavior: [channels-affiliate.md](channels-affiliate.md).

| Subview | Confirmed responsibility | Boundary |
|---|---|---|
| Channels | YouTube/Facebook Page types; manual tags/categories/groups; connection and API authorization setup. | Connected, management access, and publishing capability are different. Douyin intake sessions belong to SCR-01. |
| Channel → Configuration | Channel identity, internal labels, authorization/reconnection and supported posting defaults. | Do not expose unverified API features or require users to manage raw tokens in the main flow. |
| Channel → Published | Confirmed posted items, export, content, Shopee links, actual publication data, and originating workflow/run. | Upload/schedule acceptance is not publication. External-post history coverage remains open. |
| Channel → Upcoming | Concrete planned posts with expected time, readiness, and source workflow. | Read the same schedule as Automation. Empty workflow time slots are not concrete posts. |
| Shopee links | Manual URL/name/category/tag management; reverse post count and linked-post list. | No Shopee crawl/enrollment/link conversion, and no click/sales/commission claims. |
| Post detail | Export, destination, selected links, planned/actual time, state, and workflow/rule/run references. | One destination post is shared by all screens; retry does not reselect or increase usage. |

**Proposed:** retain an aggregate Posts & schedule view across channels, filters, and optional product-result editing in content/post detail. Do not create another sidebar item for product recognition. Per-channel views are confirmed; the aggregate layout is not yet final.

No-link/no-channel routing policy is defined by **AU-RT01–05** in Automation, not duplicated here. A channel's labels or a stored URL do not automatically authorize posting or change existing posts. Detailed state, editing/deletion, and history coverage are KC-P*/KC-Q*.

## 6. SCR-04 — Automation

**Goal:** create and operate flexible workflows, not merely save settings. Plus grants Automation access (D-05); credit/package-expiry behavior is proposed in [execution-policy.md](execution-policy.md) OP-P01–02 and remains unapproved under Q-05.

**Confirmed:** folders, Library content, and supported Douyin inputs; optional steps and user-selected endpoints. A completed download-only or processing-only workflow is not missing a publishing step. Direct configuration and optional profiles share Editor capabilities. No forced region/text review on automatic steps.

**Proposed subviews:** Workflow list → block-based Create/Edit → Run detail. Show source, trigger, steps/conditions, outputs, permissions, schedule, state, history, per-video progress, and failures. See [automation.md](automation.md) for ownership and maturity.

**Confirmed routing:** fixed or matched channel/Shopee selection, priority/rotation/all-authorized destinations, explicit no-match policy, stable choices for concrete posts, and a non-publishing rule test. Do not turn matching into permission to post to every account.

A dry-run explains a plan from existing data, without implicit download, analysis, paid requests, or publishing. A real test run is distinct. States must differentiate enabled/waiting, running, paused, missing access/data/resources, waiting for the desktop, source reconnection, item failure, and endpoint completion. Later cloud execution is not a current always-on guarantee.

## 7. SCR-05 — Settings

**Confirmed:** three primary groups and collapsed Advanced, without a long mandatory setup wizard (D-37–D-39). [settings.md](settings.md) owns detailed behavior, contextual setup, and open operational policies.

| Primary group | Content |
|---|---|
| General | English / Tiếng Việt and default save folder. Follow NAV-L10N; keep content languages and schedule timezone separate. |
| AI & processing | Installed local tools, missing-component downloads, recommended/default processing choices; optional detailed model changes. No separate AI BYOK branch. |
| Account | Free/Plus status, remaining credits, upgrade, and usage history. Commercial terms remain Q-05. |

**Advanced stays collapsed:** resources, concurrency, cache, and diagnostics. These capabilities remain available, but are not additional primary groups or prerequisites for working.

A missing tool prompts for its required component/download at the point of use; do not force installation of every model or a Settings visit. Premium services can be chosen within processing with cost visibility; local failure never silently becomes a paid request. Model lifecycle and settings precedence remain ST-P01–02/ST-Q01.

Users create/select category/tag labels on videos, links, and channels using a shared catalog, not a preliminary Settings catalog screen. Detailed taxonomy remains CA-Q01. Source/channel connections stay in their owning areas. Storage warnings may deep-link to Advanced; restore work context afterward. Later cloud controls must not appear operational before implementation.

## 8. NAV-03 — Shared components and states

**Confirmed:** one cross-screen queue for download, OCR, STT, translation, TTS, analysis, render, and publish jobs. **Proposed:** a dismissible panel that does not cancel work when closed, with links to the exact project/run/post. [execution-policy.md](execution-policy.md) owns the proposed distinction between closing this panel, closing the last window, explicit Quit, sleep, and recovery; these policies add no navigation area.

| State group | What users see | Actions, where supported |
|---|---|---|
| Queued/running | Video, active step, scope, execution location and real progress. | Open details; cancel when supported. Do not fabricate percentages/ETA. |
| Waiting for a condition | Specific missing model, permission, connection, resources, credits, or execution machine. | Open the appropriate resolution screen without recreating the entire job. |
| Failed/unknown outcome | Failed step or uncertain external result, retained outputs, and recovery state. | Reconcile or retry under policy; never infer a timed-out publish did not happen. |
| Complete/cancelled | Actual artifacts and any incomplete required output. | Open results; distinguish configured endpoint completion from incomplete processing. |

Preserve project/selection/playhead/edit context across navigation; exact autosave/recovery remains open. Completion notifications should not steal focus. Translate status explanations using the current UI locale while retaining stable internal state/error identifiers.

## 9. Navigation acceptance checks and gaps

`R` means a confirmed requirement; `P` means a proposed detail. These checks have **not** been executed against an application.

| ID | Check | Basis |
|---|---|---|
| NAV-AC01 | Open local video directly without Douyin/profile setup. | R: D-04/D-13/D-18 |
| NAV-AC02 | Reach the same jobs from every area and navigate to the correct project/run. | R; panel presentation P |
| NAV-AC03 | Run OCR-only independently of subtitle removal/translation/TTS. | R: D-17 |
| NAV-AC04 | Automatic extraction/removal creates no per-item region review screen. | R: D-16 |
| NAV-AC05 | Source/channel faults do not block available local videos. | R: D-04; detailed states P |
| NAV-AC06 | No mandatory profile, separate AI BYOK branch, or implicit publish on export. | R: D-05/D-10/D-13 |
| NAV-AC07 | Reach content classification without opening subtitle editing or rendering. | R: D-22; placement P |
| NAV-AC08 | Use folder/Douyin download-only, processing-only, and full workflows without mandatory unused screens. | R: D-23–D-24 |
| NAV-AC09 | A concrete Automation post appears in its channel and linked Shopee usage without a duplicate calendar. | R: D-25–D-27 |
| NAV-AC10 | Source download and Automation handoff stay distinct; local reference/copy/relink, grouped assets, and deletion-dependency visibility follow Sources/Library. | R: D-32–D-36; SL-AC01–12 |

Not yet complete: pixel layouts, minimum window size, all video/audio tools, detailed Source/Library file-lifecycle policies, Settings runtime/default policies, billing, schemas, architecture, or measured performance. All five areas have specs at explicitly stated maturity; this is not full implementation readiness. See §10 for cross-cutting bilingual checks.

## 10. NAV-L10N — English and Vietnamese support

### NAV-L10N-R01 — Required coverage · CONFIRMED

D-30 requires English documentation; D-31 requires English and Vietnamese application UX. Cover all five areas, shared jobs, dialogs, empty/loading/error states, tooltips/help, field validation, notifications, setup/model status, and account/credit screens. This is not just a sidebar translation task.

User-authored content, source titles, channel names, manually entered category/tag labels, filenames, URLs, and provider/model names are data—not interface strings to silently translate. Both English and Vietnamese media workflows remain supported independently under SC-04 and their verified model capabilities.

### NAV-L10N-R02 — Language independence · CONFIRMED

A UI language change must not alter source/translation/voice settings, subtitle/transcript content, user tags, workflow matching, selected links/channels, credits, or stored schedules. It must not start jobs, spend credits, or create another post.

Keep these concepts separate: **UI locale; content source language; output/voice language; taxonomy identity/display label; schedule timezone**. English docs or an English UI do not disable Vietnamese editing/output. A Vietnamese UI does not force all videos through translation.

### NAV-L10N-P01 — Working design · PROPOSED

| Concern | Proposed behavior / engineering rule |
|---|---|
| Selection | Settings → General → Language offers `English` and `Tiếng Việt` using self-readable names. Persist preference; prefer in-place switching without losing edits/jobs. Exact restart behavior is open. |
| First launch | Use a supported OS language when available; otherwise English. Allow explicit override. This default is proposed, not an approved marketing/geographic assumption. |
| Resources | Use stable message keys with English/Vietnamese resources, parameter substitution, plural forms, and localized accessibility labels. No runtime strings scattered as literals. i18n library is not selected. |
| Fallback | A missing Vietnamese message may fall back to English in a controlled way; show no raw key or blank action. Missing coverage fails localization QA and must not become a deliberate mixed-language shipped UI. |
| Persistent state | Store canonical state/rule IDs and values, not localized status sentences. Render labels in the selected locale; changing locale cannot break saved profiles or routing. |
| Categories/tags | Keep manually authored names unchanged. Built-in translated labels, if introduced, map to the same identity; translation must not create new labels or alter matching. Catalog translations remain Q-09/Q-10. |
| Dates/numbers | Localize presentation where appropriate but preserve amounts, units, currency, and underlying values. Always show the relevant schedule timezone; locale switching does not convert scheduling intent. Media timecodes use the agreed technical format, not locale-dependent decimal substitutions. |
| Text/data | Preserve Vietnamese diacritics and Unicode through editing, display, file paths, SRT/profile import/export, and stored labels. Handle input-method composition; shortcuts must not interrupt text entry. File-format specifics still need contracts. |
| Errors/logs | Stable error code plus a localized actionable explanation. Retain sanitized provider diagnostics when useful; do not invent translations of unknown provider facts or expose secrets. |
| Layout | Allow longer labels, wrapping, accessible focus, and fonts that render Vietnamese diacritics. Test resizing and text scaling. Do not distribute unlicensed font assets. |

### NAV-L10N acceptance checks

| ID | Scenario / expected result | Status |
|---|---|---|
| NAV-L10N-AC01 | Navigate all five areas and shared dialogs/jobs in English and Vietnamese; actions, states, errors, and setup text are covered. | R; execution pending |
| NAV-L10N-AC02 | Switch UI language with unsaved subtitle edits and queued posts: preserve text, rule IDs, amounts, selected destinations, scheduled instants/timezone, and jobs; no paid request occurs. | R; exact switch mechanics P |
| NAV-L10N-AC03 | English interface with Vietnamese output; Vietnamese interface with English output: processing follows explicit content settings. | R |
| NAV-L10N-AC04 | Vietnamese names/diacritics survive editing and relevant SRT/profile/file round-trips; compare meaning and required stored values. | P implementation checks supporting R |
| NAV-L10N-AC05 | Test long labels, plural/variable messages, missing-key fallback, accessibility names, and input-method/shortcut behavior. | P |
| NAV-L10N-AC06 | Change UI locale with manual and built-in labels in routing: identifiers and selected branches remain the same; user labels are not auto-translated. | R invariant; catalog translation details P |

Open points are tracked under **Q-10**; R-12 covers verification. No localization library or application tests have been selected/run by this document.


## Integration 0.5 implementation links

SCR-04 now has a source-only local folder-rule workspace with native folder pickers, first-intake scope, start/pause, state and errors; see [folder-intake.md](folder-intake.md). Shared job controls remain outside any one work area. Normal builds do not expose a fake Plus entitlement; development activation is explicit. The remaining Automation/connector/product scope is unchanged.

UI changes must load the [repository-local design skill](../.agents/skills/reupmatic-ui-design/SKILL.md), use shared tokens, preserve Editor functionality and record EN/VI/keyboard/visual verification separately. The owner reference is not copied literally into a marketing-style desktop layout.
