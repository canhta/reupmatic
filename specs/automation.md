# SCR-04 — Automation

> Package: 1.8 · Updated: 2026-09-15 · Language: English.
> Confirmed: flexible inputs, optional steps, user-selected endpoints, and channel/Shopee routing behavior in §10.
> `AU-P*` and `AU-RT-P01` remain proposals. Stack, quotas, billing, exact scheduling/retry behavior, and benchmarks are not approved.

## 1. Authority and confirmed requirements

Sources: B §3.1–3.3, §4.3, §5; C-18–C-22 and D-23–D-29 in [DECISIONS.md](../DECISIONS.md). Scope: SC-07–SC-10; navigation: [screens.md](screens.md). All UI follows English/Vietnamese requirements under NAV-L10N.

| ID | Confirmed requirement | Evidence |
|---|---|---|
| AU-R01 | Inputs: local folders, Library content, and supported Douyin sources/links/channels; compatible manual, scheduled, or new-content triggers. | D-04/D-23 |
| AU-R02 | Users select steps and output: download-only, processing-only, extraction/classification-only, or affiliate/distribution. | D-17/D-22/D-24 |
| AU-R03 | Reaching the configured endpoint is success, not an unfinished full pipeline. An enabled watcher keeps waiting after items finish. | D-24 |
| AU-R04 | Direct processing configuration with optional profile save/apply/import/export; no Editor opening per item. | D-08/D-13 |
| AU-R05 | Automatic OCR/removal does not require region review or cue editing. Users may still manually edit when they choose. | D-16/D-19–D-20 |
| AU-R06 | Plus grants Automation access; paid/upload/public actions have permission and limits. Local execution from the beginning; later cloud is not an always-on guarantee. | D-03/D-05–D-06/D-10 |
| AU-R07 | Channel/link routing belongs here, using configured choices and no-match policies; concrete posts are shared with Channels/Shopee views. | D-25–D-29 |

[sources-library.md](sources-library.md) owns shared intake/files and the accepted reference/copy/relink and deletion boundaries. This spec still owns initial history scope, file readiness, workflow-level duplicate handling, and output-loop policies; Library presence does not prove that a workflow has processed a version.

User-started batch in the Editor does not automatically become a workflow; detailed Free/Plus batch entitlements remain P-01/Q-05. Automatic tool execution is also distinct from workflow access. Do not simplify this screen by weakening Editor processing capabilities.

## 2. Valid workflows and completion

| Example | Flow | Item completion |
|---|---|---|
| Download only | Watch Douyin channel → filter available metadata → save video to folder. | Valid file at configured destination; no models/OCR/rendering/affiliate/channel setup required. |
| Process only | Folder receives video → apply configured processing → export to folder. | Selected processing/output is complete; no affiliate requirement. |
| Classify only | Library content → OCR/analysis → store category/tag results. | Analysis result stored; no video export required. Insufficient evidence follows CA-P04. |
| Full flow | Folder/Douyin → optional classification → processing → configured channel/link routing → publish under schedule/permission. | Each selected destination reaches its configured terminal outcome. Scheduling alone is not publication. |

These are examples, **not four fixed modes**. Compose other valid steps/endpoints while respecting prerequisites. Do not download an already available local file or repeat valid OCR solely because another workflow starts.

## 3. AU-P01 — Three subviews · PROPOSED

| Subview | Data and actions | Entry/exit |
|---|---|---|
| Workflow list | Name, source, step/output summary, enabled/paused state, schedule/watching mode, last run; create/open/enable/pause/history. | SCR-04; empty state offers blank workflow or editable templates. |
| Create/Edit | Source & trigger; Conditions & steps; Outputs; Permissions & operation. Only show settings for included steps. | List or incoming Editor/Library configuration. Receiving settings does not enable execution. |
| Run detail | Accepted/skipped videos and reasons, selected branches, progress, outputs/errors, execution location, measured cost where available. | Workflow/shared queue; open artifact/post/job, retry/cancel where supported. |

```text
Workflow name                                  [Check] [Save draft] [Enable]
Source & trigger                               Folder / Library / Douyin
Conditions & steps                             [+ Step] [+ Condition]
  Editable/reorderable blocks; validate their actual data dependencies
Outputs                                        Folder / Data / Distribution
Permissions & operation                        Schedules, limits, exceptions
Summary                                        Receive → process → finish at
```

Do not require a node canvas. Templates merely prefill editable configuration. Step changes update dependency checks; the application cannot silently add AI, uploads, charges, or publishing to repair an invalid workflow.

**Check/dry-run** explains a plan using existing data and configuration. It does not download, run new analysis, reserve a posting slot, spend credits, or publish. Missing OCR-dependent information appears as unknown/analysis required. **Test one video** is a separate real execution with explicit output/permission/cost context; it does not automatically enable a watcher. Save draft performs no work.

## 4. AU-P02 — Sources, triggers, and intake · PROPOSED

| Source | Settings to expose | Proposed behavior |
|---|---|---|
| Folder | Path, recursive scope, file types, current/new-content selection, output folder. | Accept complete/readable files; repeated events must not duplicate work. File-stability thresholds require testing. |
| Library | Selection/filter, existing/newly eligible content, required version. | Avoid unnecessary recopy/download; missing source is a distinct condition. Label changes must not silently repost. |
| Douyin source/channel | URL, authorized session, available metadata filters, history scope, scan schedule, download destination if needed. | Use verified connector behavior; no promise of real-time events, all metrics, or exhaustive history. Session resolution goes to Sources, not publishing-account setup. |

**Source means where; trigger means when to inspect/run.** One-time execution need not have a recurring schedule. Not every source/trigger combination is necessarily supported.

First activation must distinguish all existing content, a selected historical cutoff, and new content only. Do not silently scan an entire channel history or large folder. Exact defaults/limits remain AU-Q01.

Use actual metadata; missing values are not zero or automatically a match. Category/tag filters need valid existing labels or earlier analysis. Expose missing prerequisites rather than fabricating data.

Prevent unintended feedback loops: own outputs cannot automatically re-enter the same workflow. Examine nested source/output folders, renames, and A → B → A chains. Intentional A → B processing is allowed; cycle prevention and deduplication mechanics remain design work.

## 5. AU-P03 — Steps and dependencies · PROPOSED except confirmed routing

| Block | Required input | Output / boundary |
|---|---|---|
| Discover/download | Source candidate/URL and authorized access. | Video file, optionally the final endpoint; no processing model required. |
| Extract text/speech | Suitable video/audio and selected tools. | OCR/STT results with provenance; OCR-only needs no audio. See Editor. |
| Analyze & classify | OCR text or permitted configured context. | Category/tag/evidence/status under Content Analysis, not an exact-product guarantee. |
| Condition/branch | Metadata/labels/results available at that point. | A selected path and explanation; handle no-match/missing-data without expanding permission. |
| Process video | Video, enabled-tool settings, and required resources. | Configured visual/audio/removal/translation/voice/subtitle results using the same definitions as Editor. |
| Route channels/links | Configured inventory, authorized candidates, rules, and adequate data. | Selected destinations/Shopee links under AU-RT01–05; not a second routing system in Channels. |
| Save/distribute | Valid artifact and destination/permission. | Folder file, Library data, draft/scheduled post, or published result according to the selected endpoint. |

OCR for translation/classification must see frames before removal. TTS needs voice text; burned-in subtitles need a valid track. Report missing inputs on the relevant block; do not add processing or switch to paid/cloud services without permission.

Conditions can appear after the step that produces their data, not only at the beginning. D-29 settles first-match versus explicitly enabled multiple branches; tie-breaks and allocator details remain AU-RT-P01. A public-action path with undefined permission/destinations cannot be enabled.

Fixed-region settings may be reused for consistently laid-out sources; no per-video drawing is required. Auto masks/text/timing remain per-video results. Profiles/rules carry configuration, not credentials or implicit payment rights.

## 6. AU-P04 — Runs, progress, and configuration changes · PROPOSED

Separate **workflow**, **run**, **video item**, **step/job**, and **destination post**. Each result is traceable to input, configuration version, and chosen path. Event-to-run grouping and schemas remain open.

| Level | UX states | Meaning |
|---|---|---|
| Workflow | Draft; enabled/waiting; paused; missing operating condition. | Enabled is not the same as actively processing; an empty input does not disable watching. |
| Run/video | Queued; running; waiting for prerequisites/schedule; complete; skipped with reason; failed; cancelled. | Complete means its selected endpoint. No new input is a valid empty inspection, not a fake successful output. |
| Step/job | Actual progress, execution location, output/error. | Use the shared queue, not a separate incompatible Automation job system. |
| Post | Preparing, scheduled, submitting, unresolved, published, or failure presentation as applicable. | Read the same record as Channels; precise states remain KC-P06/contract work. |

Proposed job snapshots retain the configuration accepted for that work. Workflow/profile changes affect new work, not in-flight jobs silently. Retry uses the prior configuration; rerun with new settings is a distinct action. Concrete post selections are already fixed under D-27/AU-RT04.

Proposed Pause stops new intake; cancelling queued/running work is separate and explains irreversible effects. In-flight/queued behavior still needs AU-Q03. Do not promise to undo accepted provider actions, delete a published post, or refund costs merely because a local job is cancelled.

## 7. AU-P05 — Exceptions, safety, and recovery · PROPOSED

| Situation | Required/proposed response |
|---|---|
| Incomplete/corrupt/moved file or destination collision | Wait for readiness or report the item condition; do not overwrite originals or silently delete data. Naming/collision policy remains Q-04. |
| Duplicate event / crash after work but before state save | Reconcile accepted content, artifacts, and jobs before recreating work. Checkpointing must not lose already accepted items. |
| One failed model/video | Bounded retry under policy; isolate failure and preserve valid artifacts while independent items continue. No compulsory manual review or false completion. |
| Missing classification/link/channel | Follow AU-RT03 or an explicitly configured fallback. Download-only is unaffected by unselected analysis/routing steps. |
| Expired Douyin session / network/rate restriction | Wait/reconnect only affected source work; available local content continues. No aggressive retry or bypass of access restrictions. |
| Depleted credits / expired Plus | No unauthorized dispatch or silent quality/provider change. Proposed affected-step holds, local continuation, and expiry boundaries are OP-P01–02 in [execution-policy.md](execution-policy.md); approval remains Q-05/OP-Q01. |
| Paid/publishing timeout | Reconcile before resubmission. Unknown outcome is not proof of failure. Preserve the concrete post and its chosen channel/link. |
| Sleep/offline/closed app/missed schedule | Retain progress and show the actual execution condition. Proposed close/Quit, recovery, and missed-post behavior are Execution OP-P03–04; approval and OS/platform validation remain open. Later cloud handles only eligible data/permissions. |

Source-inspection schedule and posting schedule are separate. Show the schedule timezone; changing English/Vietnamese UI must not change it or reschedule jobs. Execution OP-P04 proposes bounded source reconciliation instead of replaying every missed tick, and next-permitted-slot recovery for unsubmitted recurring posts rather than a publishing burst. One-off or externally submitted posts have distinct handling. These remain proposals under OP-Q02, not hidden defaults.

Before enabling, expose authorized sources/accounts, data transfers, paid services/budgets, destination set, and exception behavior. Preauthorization can permit unattended operation; it cannot be silently expanded by a settings change.

OCR/transcripts/metadata are untrusted content, not executable instructions. Never export/log cookies or tokens. Workflow-file import/export is not confirmed merely because processing profiles support file exchange.

## 8. Acceptance checks

`R` = confirmed requirement; `P` = proposal to test after approval. **No executable application/API tests have run.**

| ID | Scenario / expected result | Type |
|---|---|---|
| AU-AC01 | Douyin → folder completes without profile/models/OCR/render/affiliate/publishing setup. | R |
| AU-AC02 | Folder → processing → folder is independent of Douyin and distribution; retains configured Editor capabilities. | R |
| AU-AC03 | OCR/classification-only stores results without video/subtitle export. | R |
| AU-AC04 | Authorized full flow needs no region/cue review gates. | R |
| AU-AC05 | A watcher stays enabled after a video completes and accepts subsequent eligible content. | R |
| AU-AC06 | Direct configuration and equivalent optional profiles execute the same processing without per-video Editor actions. | R |
| AU-AC07 | Incomplete files, repeated events, nested outputs, and cycles do not cause premature processing or runaway loops. | P |
| AU-AC08 | Initial activation honors selected historical scope; no unapproved full backfill. | P |
| AU-AC09 | Conditions with missing inputs and multiple matches expose dependencies and selected policy without extra AI/unrestricted posting. | P; routing rule choice R |
| AU-AC10 | Dry-run lacking new OCR reports unknown rather than running download/AI/paid/public steps. | P; routing trial R |
| AU-AC11 | Item/source failures preserve valid work and isolate the affected scope. | P |
| AU-AC12 | Crash/timeout after an external action triggers reconciliation, not blind resubmission. | P mechanism; D-10/D-27 invariants |
| AU-AC13 | Profile/workflow edits and pause/cancel make configuration version and affected work explicit. | P |
| AU-AC14 | Missing models/credits/permissions, offline execution, and missed schedules are visible; no hidden paid/cloud fallback. | P |
| AU-AC15 | Instruction-like OCR cannot alter rules, outputs, or permissions. | P; D-10 invariant |
| AU-AC16 | Fixed/matched channel and Shopee selection produce explainable choices within the authorized inventory. | R: AU-RT01–02 |
| AU-AC17 | Priority/rotation/all-authorized modes and explicit link limits are respected; no default publish-to-all. | R modes; allocator details P |
| AU-AC18 | No link/channel or lost access follows configured behavior without per-item prompts or new destinations. | R: AU-RT03 |
| AU-AC19 | First matching rule is the default; multiple branches require enabling, not an accidental all-match execution. | R: AU-RT02 |
| AU-AC20 | Retry preserves the post/channel/link/schedule identity and usage count; two channel posts have separate outcomes. | R: AU-RT04 |
| AU-AC21 | Test rule explains choices/unknowns without new analysis, live posting, credit use, slot/rotation mutation, or usage counts. | R intent; P allocator nonmutation detail |
| AU-AC22 | Locale switching preserves matching identities, manual labels, schedules, posts, and credit values. | R: D-31; NAV-L10N |

## 9. Open decisions and verification

| ID | Remaining work | Owner/source |
|---|---|---|
| AU-Q01 | Initial history scope, definition of new/duplicate across source/workflow/file versions, scan bounds, file-readiness detection. | Q-02/Q-04; R-01/R-10. |
| AU-Q02 | Exact ties/rotation advancement/concurrency, overlapping branch destination deduplication, uncertainty thresholds and post-template details. Accepted routing modes/no-match choices are in §10, not open again. | Q-02/Q-06/Q-09; AU-RT-P01; KC-Q*. |
| AU-Q03 | Polling cycles, timezone/catch-up, concurrency/preview priority, retry counts, pause with accepted work, version/reconciliation mechanics. | Q-02/Q-03/Q-07; proposed lifecycle/catch-up in Execution OP-P03–05/OP-Q02; R-10/R-11/R-15. No invented SLA or approval. |
| AU-Q04 | Credits/expiry/offline rights/budgets and provider cancel/refund semantics. | Q-05/P-02; proposal now in Execution OP-P01–02/OP-Q01. No assumed monthly price, unlimited usage, or approved charge for local work. |

This spec does not select APIs/models/engines or finish billing. [settings.md](settings.md) owns the simple Settings UX; [execution-policy.md](execution-policy.md) owns proposed cross-cutting gates/lifecycle/recovery, pending approval. Sources/Library has a separate spec; its unresolved lifecycle policies remain SL-Q01–04. Use R-01/R-02/R-10/R-11 evidence and later `AU-ID → contract → task → test` traceability. Mock success does not prove stable crawling/publishing.

## 10. Channel and Shopee routing · CONFIRMED at the stated level

Sources: C-22, D-27–D-29. [channels-affiliate.md](channels-affiliate.md) owns inventory, post records, schedule display, and reverse usage—not a second set of routing rules. Missing algorithm/API detail remains proposed/open.

### AU-RT01 — Configure once, select automatically

| Rule part | Accepted configuration choices |
|---|---|
| Video condition | Category, tags, and understandable groups of conditions, using valid data available at that step. |
| Destination channels | Fixed channel(s), or candidates matched by configured tags/categories/groups within the allowed set. |
| Shopee links | No affiliate; fixed selected link(s); or candidates matched from the manually maintained Shopee inventory. |
| Timing | Workflow publishing settings; create an independently tracked post for each selected destination. |

A fixed choice is still automation: select once in configuration, not once per video. Selecting by broad category is not exact product verification. A product-specific link rule needs suitable evidence or an intentional user mapping; do not claim the selected product is verified just because the rule matched.

### AU-RT02 — Multiple matches

Channel selection modes: **one by priority**, **rotate among suitable candidates**, or **all suitable channels within the authorized set**. Mode must be explicit; matching never defaults to publishing everywhere.

Configure a maximum link count and link priority. The accepted starting default is **one preferred link**; it is not a permanent hard limit. Additional links require explicit configuration and verified placement capability.

Evaluate ordered rules with **first matching rule** as the default. Running multiple branches must be explicitly enabled. Filter eligibility before allocating; exact tie-breaks, rotation state, and per-destination deduplication remain AU-RT-P01. Do not silently choose a random channel/link to resolve unspecified behavior.

### AU-RT03 — Missing matches and access

| Condition | Accepted behavior |
|---|---|
| No suitable link | Follow the workflow's configured choice: publish without affiliate, or retain the export and skip distribution. No per-video selection prompt. |
| No suitable channel | Retain output and record No matching channel; continue independent items. |
| Selected channel loses publishing access | Preserve the selected destination and report missing access. Do not reroute outside the configured choice merely to complete the item. |
| Required category/evidence missing | Do not claim a match; follow an explicit fallback or finish the affected branch with a reason. No forced classification/product guess. |
| Affiliate is not selected at all | Do not consult or require the Shopee library. |

An affiliate-enabled workflow must expose its no-match choice before activation; no unannounced default to affiliate-free publishing. Processing output can be complete while distribution was skipped; state must describe both rather than report a post that never happened.

### AU-RT04 — Retain selections in concrete posts

When creating a post, retain **export/version + destination + chosen links/content + schedule + source workflow/rule/run**. See KC-POST01. Retry the same post without re-matching labels, randomly rotating, adding another usage, or changing the URL snapshot.

Recheck current authorization before the public action, even though the selection is retained. New tag/catalog/workflow choices must not silently rewrite queued or published posts. A deliberate rerun/reassignment is different from retry; pending-edit rules remain KC-Q02.

### AU-RT05 — Test rule without side effects

Select an existing video and show matching rules, considered destinations/links, selected mode/result, no-match branch, and a concise reason. If necessary analysis is absent, show that the outcome is unknown until an authorized run produces it.

Testing a rule does not publish, create concrete scheduled posts, count link usage, or spend credits. It is optional operator inspection, never a mandatory checkpoint on each automatic run.

### AU-RT-P01 — Remaining allocator detail · PROPOSED

Use stable identities and deterministic ordering rather than localized strings; preserve a trace of matching inputs and rule version. Define when rotation advances/reserves a slot, how concurrent runs avoid collisions, what happens after failed/cancelled assignments, and how explicit multiple branches avoid accidental duplicate destination posts. A rule test should simulate without mutating allocator state.

Tie-breaks, candidate refresh, snapshot boundaries, schedule capacity, and retry/backoff parameters require contracts and R-11 tests. Do not invent a hard-coded algorithm and present it as owner-approved behavior. UI locale changes must not alter the resulting decision.
