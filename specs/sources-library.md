# SCR-01 — Sources & Library

> Implementation note — 0.7.0: The 0.7 source implements local Library imports, same-content relinking, recorded project/subtitle/export links and staging into the existing batch queue. Online Downloads, label/catalogue management, Shopee and publishing connections remain outside this slice. Implementation details: [local Library](../docs/development/local-library.md). This note does not replace the confirmed requirements below.

> Package: 1.8 · Updated: 2026-09-15 · Language: English.
> Confirmed: the accepted Downloads/Library flows, reference-first local import with optional copy, duplicate handling choices, and separate deletion actions with dependency visibility.
> Proposed/open: detailed states, identity/version algorithms, collision handling, retention, and irreversible-deletion policy. No connector tests, application build, or storage benchmarks have been run.

## 1. Authority and confirmed behavior

Scope: SC-01–SC-02; decisions: C-24/D-32–D-36 in [DECISIONS.md](../DECISIONS.md). Follow [screens.md](screens.md) for navigation and English/Vietnamese UX. `SL-R*` records accepted behavior; `SL-P*` is a design proposal; `SL-Q*` identifies remaining decisions. Approval of the preceding screen proposal does not approve unseen deletion, charging, or runtime defaults.

| ID | Confirmed requirement | Authority |
|---|---|---|
| SL-R01 | Separate Downloads and Library tabs. Local import/direct Editor opening is first-class; no required Douyin account or profile. | D-04/D-13/D-18/D-32–D-33 |
| SL-R02 | Supported video/channel/share links → source recognition → accessible candidates → filter/select → download to the chosen folder. Do not claim complete channel coverage or missing metrics. | D-32; B §3.1 |
| SL-R03 | Main connection/reconnection action, with manual cookie entry as an advanced option. Session/runtime/security details and source capabilities require verification. | D-07/D-32; P-03/R-01 |
| SL-R04 | One-time Download selected is distinct from Create automation from this source. Download-only completes at a valid destination file, without OCR, classification, rendering, or publishing. | D-24/D-32 |
| SL-R05 | Group originals, projects, generated text/audio, exports, labels, and distribution references under content items rather than flattening all files into one list. | D-33; B §3.2 |
| SL-R06 | Local import references the existing file by default; Copy into Library is optional. Locate moved files without deleting the project. | D-34 |
| SL-R07 | Detect/report existing content; support reuse or deliberate separate import/download. Filename equality alone does not establish duplication. One source can serve multiple projects. | D-35 |
| SL-R08 | Distinguish Library removal, project/generated-asset deletion, cache cleanup, and original-file deletion. Show affected projects and pending posts before file-affecting actions. | D-36 |
| SL-R09 | Library actions include open/edit, multi-select processing, analysis/classification, manual labels, folder access, and export-to-post preparation. Analysis does not require opening the Editor. | D-22/D-33 |
| SL-R10 | Sources and Automation share download results, file state, and Library assets. Automation owns monitoring/rules; it is not a second downloader or Library. | D-18/D-23/D-32–D-33 |

## 2. Downloads — accepted flow and proposed presentation

**Accepted flow:** paste a link or share text → discover available content → filter/select → choose a destination → Download selected. Open an existing local file without entering this flow. Discovery may access the authorized source; it is not implicit permission for AI processing, publishing, or a recurring crawl.

### SL-P01 — Controls and states · PROPOSED detail

| Component | Data/actions | Boundary |
|---|---|---|
| Source input | URL/share text, recognized source and link type, discover/refresh. | Invalid/unsupported input is explained. Do not pretend an unimplemented connector works. |
| Connection | Connected, verification required, expired, or unavailable; connect/reconnect; advanced cookie entry. | Return to the interrupted operation. Source sessions belong here, not in publishing-channel configuration. |
| Candidates | Thumbnail, title, author, date, duration, likes where available; selection and download state. | Missing values are unavailable, not zero. Provider data is not an instruction or trusted filename. |
| Filters and selection | Available date/duration/engagement filters; explicit selected count. | Distinguish loaded results, filtered results, and selected results. No hidden channel-wide selection. |
| Destination and actions | Folder, count, Download selected; Create automation from this source. | Starting a one-time download does not enable monitoring. Exporting settings grants no new permissions. |
| Progress | Shared job queue with per-item queued/running/complete/failed/cancelled states. | Show actual progress where known; no invented percentage or estimated duration. |

Partial discovery must remain explicit: show how many candidates were retrieved and whether more may be available. A paginated list or failed next page is not a complete channel scan. The control for requesting more results and any scan bounds remain SL-Q01/AU-Q01.

Expired sessions or source verification block only the affected intake operation. Already available local videos remain usable. Do not require users to solve verification for every item when the session remains valid; do not bypass verification. Browser profile, cookie protection/erasure, persistence, and headless/headed recovery remain P-03/R-01 design and test work.

A completed download means a usable file at the selected destination. A metadata row, incomplete file, or successful network request alone is not completion. Reopening the file from Downloads and Library must lead to the same recorded asset, not competing download histories. Validation/resume specifics remain SL-Q01.

## 3. Library — content and action ownership

**Accepted organization:** show one main item for a content entry; open it to inspect its related originals, projects/variants, text/audio, exports, labels, and distribution history. This does not settle the exact identity/schema or how intentionally duplicated imports are grouped.

### SL-P02 — Views and relationships · PROPOSED detail

| View | Contents/actions | Owning behavior |
|---|---|---|
| Library list | Thumbnail/title, source, duration, availability, category/tag, project/export indicators; search/filter/multi-select/import. | List/card layout and exact filters remain UX detail. |
| Original & source | Local path, reference/copy/download origin, source URL/author where available; open folder/locate file. | Import and file lifecycle: this spec. No secret cookies in displayed metadata. |
| Projects & variants | Related editable projects and language/output variants; open the selected one. | [editor.md](editor.md); creating a project need not duplicate the original file. |
| Text, audio & analysis | OCR/STT provenance, translations, subtitles, generated audio, classification and evidence. | Editor owns cue edits; [content-analysis.md](content-analysis.md) owns analysis and labels. |
| Exports | Concrete output files, version/settings relationship, availability; open/export-to-post preparation. | An export is not the original, a project, or proof of publication. |
| Distribution & activity | Posts using an export, planned/actual times, source workflow/run and relevant jobs. | [channels-affiliate.md](channels-affiliate.md) and [automation.md](automation.md); shared records, not another calendar. |

Keep **file availability**, **processing state**, and **publishing state** separate. An available original may have a failed render; a missing original does not prove an already created export or platform post is missing. Show the selected project's/export's identity rather than opening the original for every action.

Multi-select actions must state their scope. Analyze & classify can end with labels/data; Process selected opens or configures batch without a mandatory profile; Prepare post uses an explicit export and does not publish. Manual label editing remains available and does not trigger an undisclosed rerender, AI call, or repost.

## 4. Local import and relocation

| Mode / operation | Accepted behavior | Detail still to specify |
|---|---|---|
| Reference existing file — default | Register the existing location without duplicating the original video. Editing does not overwrite that source. | File access permissions, location identity, change detection, and optional lightweight indexing. |
| Copy into Library — optional | Copy to the configured Library location; keep the incoming file intact. | Managed-directory layout, collision policy, copy verification, interruption/resume. |
| Locate missing file | Reassociate the file without discarding projects or their edits. | Validate candidate identity; changed bytes require version/dependency handling rather than blind cache reuse. |

### SL-P03 — Import integrity · PROPOSED detail

An incomplete copy must not replace a valid reference or be recorded as ready. Missing/unmounted/read-protected files retain their project context and display the specific availability condition. User-remapped paths must be checked: matching a filename is not evidence that all previous OCR, timing, previews, or exports still apply.

Reference mode may still create explicitly identified thumbnails, metadata, or preview cache; it does not promise zero disk usage. Do not run OCR, translation, TTS, paid services, or full rendering just to register a file. Such work requires a user action or an enabled workflow with the necessary permissions.

Moving or editing an external original must not silently overwrite manual transcript/subtitle work. The exact file-version and invalidation contract is SL-Q02 plus Editor's dependency rules. A local path is not an uploaded asset; future cloud work requires actual data transfer and permission, not merely a saved reference.

## 5. Existing content, duplicate events, and destination conflicts

**Accepted:** identify existing content, offer reuse or a deliberate separate copy/version, and allow multiple projects from one source. Never use filename equality alone as the identity test.

### SL-P04 — Matching and conflict behavior · PROPOSED detail

| Situation | Proposed handling |
|---|---|
| Same source video encountered again | Link to the known entry and available file when identity/version are established. A historical downloaded flag with a missing file is not a usable asset. |
| Same filename, different content | Keep distinct; never overwrite or merge automatically. Explain a destination naming conflict separately from content duplication. |
| Different paths or names, potentially same content | Use verified identity evidence before proposing reuse. Hashing/fingerprints and performance are not selected by this document. |
| Intentional additional copy/project | Record the user's choice. Another project may reference the same original; another physical copy must use a non-conflicting destination. |
| Retry or repeated event | Reconcile the existing job/file before creating a duplicate download or output. Cancellation, partial data, and resume remain explicit states. |
| Manual action and Automation overlap | Share known assets/results; separately evaluate whether this workflow has processed this version. Library presence alone does not mean every workflow is complete. |

A manual duplicate choice must not become a popup for every automatic intake item. Automation needs a preconfigured duplicate policy under AU-Q01; no unseen default is approved here. Collision-resistant naming, path sanitization, atomic file completion, partial-file cleanup, and crash reconciliation require SL-Q01–02/R-13. Titles/share text must not escape the selected destination or become executable instructions.

## 6. Removal, deletion, and dependencies

**Accepted boundary:** separate the following actions and preview their concrete scope. For file-affecting actions, show affected projects and pending posts, not just a generic confirmation.

| Action | Intended scope | What it must not silently mean |
|---|---|---|
| Remove from Library | Library organization/record visibility. | Delete the user's original, destroy unrelated project data, or erase published-post history. Exact archive/record-retention behavior remains open. |
| Delete project / selected generated assets | The explicitly named project or artifacts. | Also delete a shared original, another project, or an export used elsewhere without a separate explicit scope. |
| Clear cache | Identified recreatable temporary data. | Treat manually edited text, final exports, source files, or required models as disposable cache. |
| Delete original file | The specific physical original, with affected references shown. | Infer authorization from a remove-from-list action or silently delete all copies/variants. |

### SL-P05 — Protection and recovery · PROPOSED detail

Show file paths, asset types, reclaimable size where known, and references from projects, active jobs, or pending posts. Shared files are counted once; an export may remain usable even when its original is removed. Default proposal: block deletion of files currently in use until the relevant work is resolved, rather than racing active jobs. Blocking/override behavior is **not yet an approved policy**.

Moving to operating-system trash versus permanent erasure, recovery windows, cache quotas, archive visibility, auto-cleanup, and post-history retention remain SL-Q03. An affirmative review of this screen design is not blanket authorization to erase user files. File removal does not delete a platform post, cancel a publication, or change Shopee usage counts as a hidden side effect; those actions belong to their owners and permissions.

## 7. Cross-screen and Automation handoff

**Accepted:** Sources manages intake/assets; Automation manages when to run, conditions, and endpoints. Both use the shared queue and the same file/result records. No second Library or source-connection store is introduced.

**Proposed handoff:** Create automation from this source transfers recognized source/session reference, available filters, and destination settings into a draft. Do not copy secrets or confuse currently selected videos with permission to crawl all history. The user still configures/validates initial scope, trigger, steps, endpoint, and permissions before enabling; access follows the approved Free/Plus policy.

An enabled workflow may explicitly process incoming Library items. That is different from Library import always running OCR or publishing. Folder watcher readiness, initial history intake, new/duplicate processing scope, and output-loop prevention remain Automation AU-Q01; intake does not decide them silently.

[settings.md](settings.md) owns the default save folder, AI setup, Account, and collapsed resource/cache controls, not per-source rules. Missing components are installed contextually; creating/selecting labels here uses the shared catalog without Settings setup (D-38–D-39). Apply NAV-L10N throughout: translate actions/states/errors into English and Vietnamese while retaining user titles, paths, manual labels, and stable identity. Changing UI language must not reimport content or requeue jobs.

## 8. Acceptance checks

`R` checks accepted requirements; `P` checks proposed details only after approval. These are **unexecuted acceptance scenarios**, not evidence of functioning download/storage code.

| ID | Scenario and expected result | Basis |
|---|---|---|
| SL-AC01 | Open/import a local video without Douyin or a named profile; it is usable by Editor and Library. | R: SL-R01/SL-R06 |
| SL-AC02 | Discover a supported channel/share link, filter/select retrieved items, download to a chosen folder; do not claim unobserved pages or missing metrics. | R: SL-R02; R-01 live verification pending |
| SL-AC03 | Download-only finishes at a usable file; no OCR, model setup, rendering, channel setup, or publishing is required. | R: SL-R04 |
| SL-AC04 | Create automation from a source transfers context but does not enable, crawl additional history, spend credits, or publish. | R: explicit handoff; P: transferred-field detail |
| SL-AC05 | Reference import does not copy/overwrite the original; optional copy preserves it; locating a moved file keeps project edits. | R: SL-R06 |
| SL-AC06 | Same name/different contents, repeated source item, and an intentional additional project are distinct cases; reuse/additional-copy choices remain available. | R: SL-R07; P: identity algorithm |
| SL-AC07 | Inspect one content item and open the exact project/export/text/analysis/post; classification can run without entering Editor. | R: SL-R05/SL-R09 |
| SL-AC08 | Removal/deletion/cache actions are distinct; file deletion previews affected projects and pending posts and has no hidden publishing/history side effects. | R: SL-R08; P: final retention/blocking policy |
| SL-AC09 | Partial copy, full disk, moved/changed original, collision, cancellation, and crash never present an incomplete file as ready or silently overwrite an original. | P: SL-P01/SL-P03/SL-P04; R-13 |
| SL-AC10 | Manual intake and a workflow encounter the same media: share file state/results without assuming all workflows already processed it or prompting per automatic item. | R: SL-R10; P: deduplication scope |
| SL-AC11 | Source session expires while local editing proceeds: reconnect the affected intake operation without locking existing local content. | R: local independence; P: recovery detail; R-01 |
| SL-AC12 | English/Vietnamese labels, long names, diacritics, and localized errors work; locale changes preserve files, selections, identities, and pending jobs. | R: NAV-L10N; R-12/R-13 execution pending |

## 9. Remaining decisions and verification

| ID | Still open | Owner / evidence |
|---|---|---|
| SL-Q01 | Connector support/limits, incremental discovery, session implementation, file validation/resume, naming/collision/partial-file handling. | Agent research and proposals; R-01/R-13. Do not promise current Douyin reliability from this spec. |
| SL-Q02 | Media/file identity and versioning, copy/reference implementation, deliberate-duplicate grouping, relink checks, stale dependencies, workflow deduplication boundary. | Q-04 with AU-Q01/Editor; R-10/R-13. Reference-first and reuse choices are already decided. |
| SL-Q03 | Record archiving/removal, original/generated-file deletion, active-use protection, trash/recovery, retention, quotas, and dependency counts. | Q-04; owner approves destructive consequences. Historical post/link policy remains KC-Q01. |
| SL-Q04 | Exact table/card/filter layout, supported media/path matrix, minimum window behavior, directory defaults, and detailed contextual setup behavior. | Settings ST-Q01 / UX and target-hardware work; Q-03/Q-08/Q-10/Q-11; R-05/R-12/R-13/R-14. |

**R-13** must test reference/copy import, move/change/relink, permissions, removable locations, Unicode names, duplicates/collisions, interrupted writes, retries/crash recovery, shared dependencies, and deletion scope on the supported desktop matrix. Fixtures/mock tests do not establish live connector reliability. No schema, stack, price, or data-retention policy is selected here.

**Execution-policy handoff:** [execution-policy.md](execution-policy.md) proposes offline/quit/recovery and bounded missed-source reconciliation. Keep the selected intake/history scope, reference-first import, and shared file/download records; expiry does not authorize file deletion or hide owned outputs. Unsubmitted work and external requests have different recovery paths; OP-P* policies remain unapproved.
