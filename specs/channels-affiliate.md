# SCR-03 — Channels & Shopee Links

> Package: 1.8 · Updated: 2026-09-15 · Language: English.
> Confirmed: YouTube/Facebook Page configuration and manual labels; manually entered/tagged Shopee links; reverse post usage; shared channel history/schedules with Automation.
> Proposed/open: detailed tables, connection UX, operational states, editing/deletion, and external-post synchronization. No API, schema, or pricing policy is approved.

## 1. Authority, requirements, and ownership

Sources: B §4.1–4.3; C-20–C-22 and D-25–D-29 in [DECISIONS.md](../DECISIONS.md). Scope SC-09–SC-10; navigation and bilingual UX in [screens.md](screens.md). `KC-R*`/`CONFIRMED` have confirmation; `KC-P*` are proposals; `KC-Q*` are open. Confirmation is not proof of working integration.

| ID | Confirmed requirement | Evidence |
|---|---|---|
| KC-R01 | Multiple YouTube channels and Facebook Pages, distinguished by platform type; manually assigned tags/categories/groups. | D-09/D-25; B §4.2 |
| KC-R02 | API connection/authorization setup for automated publishing; distinguish connected, management access, and publishing capability. Connection does not automatically enable a workflow. | D-10/D-25 |
| KC-R03 | Current inventory is manually entered Shopee links with manual tags/categories; no product crawl, link creation/conversion, or invented exact-product match. | D-09/D-26 |
| KC-R04 | Each link shows associated-post count and opens those posts. Count destination posts, not retries, clicks, orders, or commissions. | D-26 |
| KC-R05 | A channel shows published and upcoming posts from Automation, traceable to video, links, workflow, and run. | D-25/D-27 |
| KC-R06 | Automation, channel views, and reverse link usage read the same post/schedule data; no separate calendars to synchronize. | D-27 |
| KC-R07 | A concrete post retains export, destination, links, schedule, and rule/workflow origin. Retry cannot silently reselect or increase counts. | D-27 |
| KC-R08 | Routing rules belong to Automation. Non-distribution workflows do not require channel/link configuration. | D-24/D-28–D-29 |

This spec owns **channel/link configuration, concrete posts, schedule display, and reverse usage**. [automation.md](automation.md) §10 owns **matching, allocation modes, and no-match behavior**. [content-analysis.md](content-analysis.md) owns **OCR/classification**. D-39 confirms a shared catalog and manual in-context creation/selection on channels and links. Remaining taxonomy policies stay CA-P02/Q-09; this does not approve every catalog policy or require a Settings detour.

## 2. KC-CH01 — Channel list and detail

**Confirmed:** configure a channel and its publishing access, and inspect its posts/schedule through **Configuration / Published / Upcoming** tabs. Exact columns and layout are proposed.

| Location | Data and actions | Navigation / boundary |
|---|---|---|
| Channel list | Name, platform type, manual labels, connection/publishing status, nearest concrete upcoming post when known; search/filter/add/open. | SCR-03 → Channels → selected channel. |
| Configuration | Channel/platform identity, internal display name, tags/categories/groups; authorize/check/reconnect; platform-supported posting defaults. | Saving labels does not run OCR, edit routing rules, or publish a test post. |
| Published | Export/video, post content, attached Shopee links, confirmed publication time, actual post URL when available, and workflow origin. | Post → export/project, link, or exact Automation run. |
| Upcoming | Concrete planned posts, chosen export/links, scheduled time/timezone, ready/preparing/blocked state. | Open the same post/schedule as Automation, not a copied calendar entry. |

### KC-P01 — Connection experience · PROPOSED

Select platform → use its verified official authorization mechanism → choose the permitted channel/Page → check relevant capability → show result → save. The normal flow should not require users to understand scope names or manually obtain raw tokens. Protocols, endpoints, permission names, and review requirements remain R-02/Q-08.

**Check connection is not Publish a test post.** Connection checking must not create public content. Platform authorization is also not the separately removed AI BYOK plan. Integration credentials, token lifecycle, and storage belong in architecture/security work; do not assume application secrets can be embedded in the desktop client.

Specify channel defaults only after verifying platform capabilities: title/content, visibility, format, and link placement. A feature supported for one platform is not automatically supported for the other. Precedence among channel defaults, workflow settings, and per-post overrides remains KC-Q02.

## 3. KC-AF01 — Shopee inventory and reverse usage

**Confirmed:** manually enter links and assign tags/categories; inspect which posts use them. The agreed inventory operations do not require Shopee account login or catalog synchronization.

| Component | Behavior | Status |
|---|---|---|
| Link row | Identifying name, entered URL, category, tags, associated-post count. Notes/enabled state are proposed. | Core fields confirmed; layout proposed. |
| Add/Edit | Enter URL/name and assign labels manually; product-recognition AI is not a prerequisite. | Core confirmed; URL validation policy open. |
| Link detail | Link data and related posts with destination, video, status, planned/actual time, and source workflow. | Reverse navigation confirmed. |
| Click count | Open the post list for that exact counting scope; navigate to post/channel/video/run. | Traceability confirmed; filters proposed. |

**KC-R04 — Counting unit:** one concrete post for one destination channel. The same video/link posted to two channels has two posts and two uses. Retrying either post does not create another use. Dry-run candidates, workflow executions, downloads, and empty posting slots do not count as posts.

### KC-P02 — Counting scope · PROPOSED

Show the number of posts associated with a link, with filters for upcoming, published, and other states. A link repeated in several positions of the same post counts once. The displayed number must match the corresponding list under the same filter.

Cancelled/deleted posts, removed associations, retained historical uses, and duplicate inventory records with the same URL need KC-Q01 policy. Do not silently select a counting policy and then label it owner-approved.

### KC-P03 — Link edits and history · PROPOSED

Retain the chosen link identity/URL in the post snapshot. Editing the inventory URL does not silently modify already scheduled or published posts. An intentional change to an unpublished post is a separate operation with defined update behavior. A local change must not pretend to have edited the platform's actual post.

Disabling/deleting a link should expose affected rules/posts and retain appropriate history; deletion/archive behavior remains open. URL checks must not create/convert affiliate links or strip tracking parameters. Syntactic validity is not proof of product availability, correct product identity, or affiliate attribution. Short links, duplicate URL handling, and optional network resolution need separate design/permission; do not promise product verification.

## 4. KC-POST01 — Shared concrete posts and schedules

**Confirmed:** a concrete post belongs to one destination and retains its export/content/links, schedule, and workflow/rule origin. These are business relationships, not a selected database schema.

```text
Automation selects a branch, destination, and optional Shopee link(s)
  → creates a concrete post visible in that channel's Upcoming view
  → submits and reconciles the actual external result
  → appears as Published only after publication is confirmed

Shopee link → associated posts → channel / export / workflow / run
Automation and Channels → the same post and schedule
```

### KC-P04 — Proposed post detail

Show internal identity; export and version; destination; content and selected link/URL snapshot; planned time and explicit timezone; state; actual publication time and platform ID/URL when known; source workflow/rule/run; selection reason; and submission/reconciliation history. Never put tokens in post records or logs.

Distinguish **workflow execution time**, **expected posting slots with no concrete content**, and **a concrete post's scheduled time**. No content/post means a projected slot only, not a fake upcoming post or affiliate use. Multi-channel outputs have independent outcomes; one successful destination cannot mark another successful.

UI-language switching may localize date formatting and state explanations, not the chosen instant/timezone, post content, URLs, or selection (NAV-L10N). User-entered labels remain unchanged.

### KC-P05 — History coverage · PROPOSED

Initially display application-managed records with explicit coverage and last-reconciled time. Whether to also retrieve posts/schedules created outside the application remains **open under KC-Q03**, not silently excluded or promised.

Reading platform history, reconciling remote edits/deletions, and displaying Automation's own schedule are different integration concerns. Do not label a locally cached list as complete or live without evidence.

## 5. KC-P06 — Operational states and exceptions · PROPOSED

These are UX distinctions, **not approved engine enums or confirmed platform state names**.

| Situation | Visible response and action |
|---|---|
| No channels/links/posts | Offer the relevant create/connect action. An empty affiliate inventory does not block download/processing or explicitly affiliate-free publishing. |
| Not connected / insufficient publishing access | State what is missing and link to Configuration. Connected is not equivalent to ready to publish. |
| Preparing / waiting for schedule | Show remaining prerequisites, time, and execution location when known. Do not show in Published. |
| Uploading/submitting / accepted / platform processing | Show the actual known stage. Request acceptance is not publication; readback capability needs R-02. |
| Scheduled in the application or platform | Identify scheduling/execution source and pending status. Platform-native scheduling support is not assumed. |
| Confirmed published | Show real publication data and ID/URL when available; link usage points to that same post. Do not invent a URL. |
| Explicit API failure or unknown outcome after timeout | Distinguish failure from uncertainty; reconcile before retry. Do not create another post or change link/channel just to retry. |
| Access revoked after selection | Retain the chosen destination and report lost access; other independent destinations need not fail. No unauthorized rerouting. |
| Desktop offline / missed schedule | Show execution condition and missed schedule; Execution OP-P03–04 proposes recovery/catch-up under AU-Q03/OP-Q02. Distinguish unsubmitted, one-off, and externally accepted posts; no automatic duplicate posting. A calendar entry does not guarantee execution with the desktop off. |
| No suitable link/channel | Follow AU-RT03. Do not show per-video selection prompts or enlarge the authorized set. |
| Edit time, cancel, or disconnect | Open the same post/configuration with the affected scope. Pending/sent action behavior needs approval; do not promise recall of external actions. |

Show last checked/reconciled time when using cached status. Offline data is not live verification. Internal channel/link labels do not rename remote accounts or edit published metadata automatically. Localize actionable explanations in both English and Vietnamese while keeping canonical codes stable.

## 6. Integration, permission, and ownership boundaries

Future contracts must connect export → post → channel/link → run; define posting states and schedule source; snapshot/version fields; submission/external reconciliation; and consistent counting/list filters. Do not maintain a separate post record per screen.

Rules and selection order are **AU-RT01–AU-RT05** in [automation.md](automation.md). Rule tests neither create real posts/schedules nor run hidden OCR to invent missing evidence. Selecting automatically and authorizing publication are separate. Changing a label/link or connecting a channel does not expand permission by itself.

No new paywall for viewing/editing channels/links, channel counts, or link counts is approved here. Workflow Automation belongs to Plus; manual posting entitlement, limits, credits, and offline policy remain Q-05. No cloud scheduler or 24/7 service is committed by this spec. [execution-policy.md](execution-policy.md) proposes Plus/credit gates and interruption/recovery on these same concrete post records; OP-P* rules are not commercial or platform approvals.

Preserve exact manually supplied links and user data in both locales. UI translations are not translations of posts, product names, taxonomy entries, or URLs. See screens NAV-L10N for the shared localization definition.

## 7. Acceptance checks

`R` verifies confirmed behavior; `P` verifies a proposal after approval. **No application/API tests were executed.**

| ID | Scenario / expected result | Type |
|---|---|---|
| KC-AC01 | Configure YouTube/Facebook Page and manual labels; distinguish management/publishing capability; no implicit workflow activation. | R |
| KC-AC02 | Enter/classify/tag a Shopee link without crawl, product AI, Shopee login, or URL conversion. | R |
| KC-AC03 | An Automation-created post appears in the correct channel/schedule and reverse link list; navigate to export/workflow. | R |
| KC-AC04 | Same video/link to two channels → two posts/uses; retry preserves post count and selection. | R |
| KC-AC05 | Workflow time slots without concrete posts neither count as published nor increase usage. | R |
| KC-AC06 | Download/processing-only and explicitly no-affiliate flows do not require irrelevant inventory/account setup. | R |
| KC-AC07 | Post state/schedule changes are consistent across Automation, channel detail, and reverse link navigation. | R |
| KC-AC08 | Timeout, revoked access, and mixed destination results do not cause blind duplicate submission or unauthorized rerouting. | R selection/retry; P detailed states |
| KC-AC09 | Counter/list filters for upcoming/published/cancelled posts and repeated placement in one post remain consistent under approved policy. | P |
| KC-AC10 | URL/label edits or disabling inventory do not silently rewrite post snapshots/history; pending changes are explicit. | R snapshots; P edit/delete policy |
| KC-AC11 | External posts and stale/offline reads are not advertised as complete/current without verification. | P |
| KC-AC12 | Upload acceptance, processing, and scheduling are not Published; checking a connection creates no public post. | P |
| KC-AC13 | English/Vietnamese UI switching preserves manual tags, URLs, usage count, chosen destination, and schedule; both locales expose the same operations. | R: D-31; NAV-L10N |

## 8. Open decisions and verification

| ID | Remaining detail | Tracking |
|---|---|---|
| KC-Q01 | Cancelled/deleted/unlinked posts, duplicate URLs, archive/delete rules, count scopes, and impact on pending work. Counting per destination and retry stability are already confirmed. | Q-04/Q-06; agent proposes a consistent policy without silent history deletion. |
| KC-Q02 | Post templates/default precedence, per-platform link placement, editing/cancelling schedules and accepted submissions. | Q-06; R-02 evidence before contracts. |
| KC-Q03 | External-post/schedule coverage, history bounds, refresh, and reconciliation of remote edits/deletions. | Q-06/R-02; neither silently excluded nor promised complete. |
| KC-Q04 | Priority/rotation algorithms, ties, concurrent allocation, duplicate destinations across multiple branches, quotas/catch-up. | AU-Q02–03 / AU-RT-P01. Do not reopen accepted routing modes. |
| KC-Q05 | Official authorization flow, integration app, exact scopes/permissions, tokens, formats, quotas, links, platform scheduling, and reading publication state. | R-02/Q-08; current primary sources and authorized live tests required. |

**R-11:** verify routing → per-channel post → schedule → reverse count/list consistency, states, retries, concurrent work, configuration changes, missing labels, and permission boundaries. Mock tests establish internal logic only; actual publishing/history reading still requires R-02 evidence. Bilingual coverage is R-12.

[sources-library.md](sources-library.md) owns file availability and deletion dependency visibility. Removing a local file must not silently erase a post/history record or alter link usage; exact archival/retention policy remains KC-Q01/SL-Q03. This spec does not finish architecture, Settings, or credit policy, and does not present unverified API capabilities as implemented features.
