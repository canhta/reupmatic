# Decisions and Open Questions

> Version: 1.8 + integration-0.2 · Updated: 2026-09-15 · Canonical language: English.
> Evidence comes from the brief and owner conversation. Translation and specification work are not benchmarks or live integration evidence. The bounded native-media check in R-16 is separately identified; it does not validate the application or AI models.

## 1. Status and evidence conventions

| Status / ID | Meaning |
|---|---|
| `CONFIRMED` / `D-*` | An owner requirement or accepted decision. Detailed implementation may still be incomplete. |
| `PROPOSED` / `P-*` | An assistant recommendation; not authority to change the product or charge users. |
| `OPEN` / `Q-*` | An unresolved question. Agents should research and recommend, not ask about every technical detail. |
| `VERIFY` / `R-*` | Research or testing required before claiming technical support or quality. |
| `SUPERSEDED` / `S-*` | A replaced or corrected direction retained to prevent regression. |

`B` is the original owner brief, named `Pasted text.txt`, referenced by its section headings/numbers. `C-*` records the relevant owner statements below so agents do not need chat history. Assistant suggestions alone are not confirmation. All decisions added in this package are dated **2026-09-15**.

| Source | Owner evidence |
|---|---|
| C-01 | Expand research across search/web, GitHub/open source, Hugging Face, Chinese sources, social discussions, and Reddit. |
| C-02 | Prioritize Vietnamese localization, batch processing, and automation; Douyin first, with `jiji262/douyin-downloader` as an example. Discuss the full product rather than prematurely cutting scope. Video processing and automation must both work well from the beginning. |
| C-03 | Simplify API/Pro into unpaid local/free choices versus a paid app package with credits and automation. |
| C-04 | Explicitly confirm Plus includes credits and Automation access. |
| C-05 | Accept investigating headless/browser integration with user-provided cookies for Douyin. |
| C-06 | Accept later cloud support for heavy jobs and automation. |
| C-07 | Users' own videos are first-class inputs; Douyin downloading is only one input option. |
| C-08 | Request concise but context-rich agent-oriented docs; approve the seven document groups and initial Scope/Decisions/AGENTS delivery. |
| C-09 | Profiles are secondary and can be exported/imported as files. Direct editing must not require creating/loading one; XML/JSON is undecided. |
| C-10 | Iterative editing needs actual processed previews, without rendering an entire long video after each setting change. |
| C-11 | Learn UI/UX from CapCut desktop or DaVinci without matching their complexity. |
| C-12 | Text/watermark removal should support manual fixed regions and automatic detection. Models, ONNX, and OpenCV are research directions, not selections. |
| C-13 | Add standalone OCR extraction. Automatic processing must run through without requiring users to add/remove detected regions. |
| C-14 | Propose and accept five task areas: Sources & Library, Editor & Video Processing, Channels & Affiliate, Automation, Settings, plus a shared job queue. |
| C-15 | Reject weakening the Editor toolset; require real subtitle-content editing rather than style presets or a minimal text tab. |
| C-16 | Accept the revised subtitle workspace: direct text/time edits, split/merge, find/replace, translation comparison, scoped style, SRT, separate display/voice text, and protection of manual edits. This does not approve unrelated video/audio details. |
| C-17 | Explicitly add the missing OCR-to-category/tag classification workflow. Taxonomy, thresholds, label counts, and models remain undecided. |
| C-18 | Confirm flexible Automation input from folders and Douyin sources/channels; some workflows only download, some only batch-process, others run the full chain. |
| C-19 | Accept the summary of optional steps and user-chosen endpoints; this does not approve unseen polling, charging, or deduplication defaults. |
| C-20 | Specify channel types YouTube/Facebook, manual tags and API publishing setup; Shopee links manually tagged/categorized with reverse counts of associated posts; channel views show published and upcoming posts from Automation. |
| C-21 | Accept the channel/link configuration summary and continue: channel detail views, linked-post counts, and shared post/schedule data rather than duplicate calendars. |
| C-22 | Accept the proposed channel/link routing block: fixed or matched choices, destination priority/rotation/all-authorized modes, link limits/priority, explicit no-match branches, retained post selections, and non-publishing rule tests. Detailed algorithms and platform policies were not provided or approved. |
| C-23 | Require the completed documentation in English, and explicitly require the application to support English and Vietnamese. This is not a request to remove either output language. |
| C-24 | Accept the preceding Sources & Library proposal: one-time source download versus explicit Automation handoff; grouped content/assets; reference-first local import with optional copy/relink; reuse or deliberate duplicate import; and distinct deletion actions with dependency visibility. This does not approve unseen identity algorithms, history-intake defaults, irreversible deletion, retention, or charges. |
| C-25 | Reject the proposed many-group Settings screen as too complex. |
| C-26 | Accept the revised Settings proposal: General, AI & processing, and Account; collapsed Advanced controls; contextual model downloads and premium-service selection with cost visibility; inline category/tag creation/selection from a shared catalog; no long setup wizard. This does not approve unseen settings-precedence, model lifecycle, credit, or background-execution defaults. |
| C-27 | Ask to proceed with the next work on depleted credits/Plus and application closing/sleep after the v1.6 handoff. This authorizes a policy draft; it does not approve the unseen execution, charging, expiry, offline, or missed-post defaults introduced in v1.7. |
| C-28 | Prioritize delivery time and existing image/video-processing ecosystems; accept Python as a production worker, not a disposable prototype. Prefer reuse over reimplementing established components. |
| C-29 | Explicitly reject adding Rust or a future Rust rewrite. Continue with Electron/React/TypeScript, Python, and existing native libraries; optimize within that direction. |
| C-30 | Authorize the next reuse audit/integration investigation. This is not approval of every newly recommended package or license arrangement. |
| C-31 | Continue implementation using current versions and keep dependencies updated throughout the project. |
| C-32 | Name the application Reupmatic. |
| C-33 | Add formatting and pre-commit tooling; explicitly request Lefthook and suggest Biome for TypeScript. |
| C-34 | Use the attached high-end-visual-design reference to reduce poor agent-generated UI/UX, save a local skill, and continue implementation. |

## 2. Confirmed decisions

| ID | Decision and consequence | Evidence |
|---|---|---|
| D-01 | Desktop macOS/Windows for individual short-video and affiliate creators, including nontechnical users. Hardware support matrix is open. | B §2, §6 |
| D-02 | Preserve complete product scope. Do not silently remove affiliate/distribution or reduce the product to a localization utility. Release phasing may be proposed; the MVP is not selected. | B §3–5; C-02 |
| D-03 | Video/localization batch processing and automation are equal pillars from the beginning. Do not postpone all automation until cloud exists. | C-02, C-06 |
| D-04 | Local user videos and connected sources are first-class inputs. Douyin is a priority connector, not a gate. RedNote remains a research target. | B §3.1–3.2; C-02, C-07 |
| D-05 | Two modes: Free and Plus. Plus includes credits and Automation access. No separate AI BYOK path; Pro is an earlier name, not a third plan. Pricing and credit policies remain open. | C-03–C-04 |
| D-06 | Provide a local direction and later cloud extensions for heavy computation and orchestration. Automation access does not promise that every step runs with the desktop off. | B §4.3, §5–6; C-03, C-06 |
| D-07 | Investigate authorized browser/headless sessions and cookies for Douyin. No repository, runtime, headless-only strategy, or production reliability is approved. | C-05; B §3.1, §8 |
| D-08 | Editor processing configuration is reusable for other videos and automation. Versioning, overrides, invalidation, and engine design need specifications. | B §3.4, §5 |
| D-09 | Affiliate links are manually entered; AI may suggest from that inventory, not create/convert links or invent exact product matches. Authorized rule-based selection is clarified by D-28–D-29. Multiple Facebook Pages/YouTube channels remain in scope. | B §3.3, §4.1–4.2 |
| D-10 | Content rights, account authorization, secrets, data disclosure, paid actions, and public posting require controls. No silent uploads, charges, or publishing beyond permission. | B §2, §4.3, §5 |
| D-11 | Research broadly, then verify original sources, licenses, and actual behavior. Community leads and owner-named models/repos are not approved choices. | B §8; C-01 |
| D-12 | Seven document groups: Scope, module specs, Architecture, contracts, Decisions, Build Plan, and AGENTS. Avoid duplicate BRD/PRD/SRS sets. The number of groups is not a file limit. | C-08 |
| D-13 | Profiles are optional save/apply/import/export actions. Direct editing, batch, and workflow setup cannot require creating a named profile. File format/dependency/version policies are open. | C-09; supplements D-08; replaces S-05 |
| D-14 | Iterative preview must show real processed output without full-video rendering after every adjustment. Sample lengths, cache, quality modes, and performance defaults remain proposals. | C-10 |
| D-15 | Learn interaction patterns from CapCut desktop/DaVinci while simplifying the experience. Do not copy assets or assume professional-editor parity. | C-11; B §3.4 |
| D-16 | Manual fixed-region removal and fully automatic text/watermark processing are separate paths. Automatic detection/OCR/removal must not require per-region add/remove/approval. This does not grant unlimited paid/public actions. | C-12–C-13; replaces S-06 |
| D-17 | Standalone OCR extracts frame text without requiring removal, STT, translation, or TTS. Source merging, timing, non-subtitle outputs, and quality need further work. | C-13; B §3.3 |
| D-18 | Five task-oriented navigation areas and one cross-screen job queue. Their authoritative definition is `specs/screens.md`; the areas are not compulsory sequential steps. | C-14 |
| D-19 | A substantial subtitle workspace within the Editor supports synchronized table/timeline/preview selection, direct editing, add/delete/split/merge, timing shifts, find/replace, source comparison, and scoped styles. See Editor §10. | C-15–C-16; B §3.4, §3.8 |
| D-20 | Displayed subtitles and TTS text are independently editable. Display edits do not call OCR/translation/TTS; applying changes to voice text is explicit. Preserve manual edits and do not charge while typing. No mandatory per-cue review in auto workflows. | C-16; supplements D-10/D-16 |
| D-21 | Subtitles can be created manually, from OCR/STT, or by SRT import; export a subtitle file, burned-in video, or both. Editing OCR text does not itself replace text burned into source pixels. Other formats and detailed parsing/style rules are open. | C-16; B §3.8 |
| D-22 | Provide OCR → content analysis → category/tag assignment, independently of subtitle editing. Connect results to Library organization, affiliate suggestions, and routing conditions. `CA-P*` details remain proposals. | C-17; B §3.3–4.3 |
| D-23 | Automation accepts folders, Library content, and Douyin sources/links/channels, with compatible manual/scheduled/new-content triggers. Connector capabilities still need verification. This confirms the input part of P-07. | C-18–C-19; B §4.3 |
| D-24 | Users choose Automation steps and endpoints. Download-only, processing-only, extraction/classification-only, and full publishing are valid completed workflows. Enabled watchers remain active after items finish. Do not require unused tools/accounts. | C-18–C-19; supplements D-13/D-17/D-22 |
| D-25 | Channels distinguish YouTube and Facebook Page, support manual tags/categories/groups and API authorization setup, and expose Configuration/Published/Upcoming views. Connected, management access, and publishing capability are distinct. | C-20–C-21; B §4.2 |
| D-26 | Current affiliate inventory is manually entered Shopee links with manual tags/categories. Show reverse post usage. Count one post per destination channel; retrying it does not increase the count. This is not clicks, sales, or commissions. | C-20–C-21; narrows D-09 inventory scope |
| D-27 | Automation, channel history/calendar, and affiliate usage share concrete post/schedule data. A post retains export, channel, selected link(s), schedule, and workflow/rule origin; retries do not reselect or recount it. A workflow time slot without a concrete post is not a published/scheduled-post record. | C-21–C-22 |
| D-28 | Routing belongs to Automation. Support fixed destinations/links or tag/category/group matching; channel priority, rotation, or all matching destinations within the authorized set; explicit maximum links and priority. One preferred link is the accepted starting default, not a hard global limit. Broad category matching is not exact product verification. | C-22 |
| D-29 | No-match behavior is configured once, not prompted per video: no link → configured no-affiliate publishing or keep output without distribution; no channel → retain output with a reason; lost access never expands destinations. Use the first matching rule by default; multiple branches require explicit enabling. Rule tests explain choices without actual publishing or spending. | C-22 |
| D-30 | The canonical delivered and maintained documentation must be in English. Translate the complete current package, preserve requirements/IDs/statuses, and avoid divergent bilingual copies of the specs. | C-23 |
| D-31 | The application supports English and Vietnamese UX. UI locale is distinct from source/output/voice language and scheduling timezone; changing UI language must not mutate content or workflow behavior. Concrete localization defaults are tracked separately. | C-23; SC-14; NAV-L10N |
| D-32 | Sources has a Downloads flow for supported video/channel/share links, accessible candidates, available-metadata filters, selection, and folder destination. Main connect/reconnect with advanced cookie entry; one-time downloading is separate from configuring a source-based workflow. Download-only invokes no compulsory processing/publishing. Runtime/security/capability verification remains open. | C-24; D-07/D-24; B §3.1 |
| D-33 | Library groups related originals, projects, generated text/audio, exports, labels, and distribution references into content entries. Support direct editing, multi-select processing, analysis/classification, manual labels, folder access, and post preparation without forcing a single pipeline. Sources and Automation share assets/download state. | C-24; B §3.2; supplements D-18/D-22 |
| D-34 | Local import references the existing file by default, with optional Copy into Library. Locate moved files without discarding projects; do not overwrite the user's original during import/editing. Exact identity/version and recovery mechanisms remain open. | C-24; resolves reference/copy default in Q-04 |
| D-35 | Detect/report existing content and allow reuse or a deliberate additional import/download; same filename is not sufficient evidence. Multiple projects may use one original. Matching algorithms, physical-copy grouping, and autonomous intake policies remain open. | C-24; Q-04/AU-Q01 |
| D-36 | Separate remove-from-Library, delete-project/generated-assets, clear-cache, and delete-original actions. Preview affected projects/pending posts before file-affecting actions. This is not approval of automatic erasure, irreversible deletion, retention limits, or history removal. | C-24; D-10; B §3.2 |
| D-37 | Settings has three primary groups: General (UI language/default save folder), AI & processing (installed tools, missing downloads, recommended/default choices), and Account (Free/Plus, credits, upgrade, usage history). Resource/concurrency/cache/diagnostic controls remain in collapsed Advanced. Simpler Settings does not weaken the Editor or remove safeguards. | C-25–C-26; replaces S-11 |
| D-38 | No long mandatory onboarding wizard or all-model/Douyin setup before work. Install a missing local component contextually with purpose/size/Download; select premium processing in context with cost visibility. Do not switch to paid processing automatically because the machine is weak or a local tool is unavailable. Detailed installation/accounting behavior remains open. | C-26; D-04/D-10 |
| D-39 | Users create/select category/tag labels where they manage videos, Shopee links, and channels, sharing one catalog without preliminary Settings setup. This confirms manual contextual access, not an initial taxonomy, automatic label creation, merge/delete policy, or label-language policy. | C-26; partially resolves P-12/Q-09 |
| D-40 | No first-party Rust component or Rust rewrite roadmap. Continue with Electron/React/TypeScript for UI/orchestration and Python production media/AI workers, reusing existing native executables/libraries. Exact package releases and backend vendors are not approved by this direction. | C-28–C-29 |
| D-41 | Optimize delivery effort as well as performance. Evaluate reusable editor/media/AI components before implementing equivalents; integration, packaging, license obligations, and maintenance are part of the cost. Preserve the full toolset and workflows; do not achieve reuse by cutting scope. | C-28–C-30; D-02–D-03/D-19–D-21 |
| D-42 | **Reupmatic** is the application/product name. Update active UI/package/docs without destroying historical evidence or silently migrating/deleting user data. | C-32 |
| D-43 | Keep project dependencies current through an ongoing update process. Stable-compatible pins, reviewed PRs and reproducible locks are the selected engineering policy; no untested automatic production upgrades. | C-31; implementation policy in CONTRIBUTING |
| D-44 | Provide formatting and pre-commit controls using **Lefthook**; evaluate/adopt Biome for TypeScript rather than adding redundant tool stacks. Biome/Ruff versions and exact hook behavior are reversible engineering choices, not a new runtime or product policy. | C-33 |
| D-45 | Maintain a repository-local high-end UI/UX skill based on the owner attachment and require agents to consult it for UI changes. Preserve the source and distinguish explicit desktop adaptations; do not reduce product capabilities or claim visual validation from source-only checks. | C-34 |

## 3. Proposals and partially resolved proposals

Previously proposed text is retained for traceability. A confirmed portion points to its decision; remaining details are not implicitly approved.

| ID | Proposal | Remaining work / status |
|---|---|---|
| P-01 | Keep user-started local batch in Free; Plus enables workflow orchestration. | Batch/workflow boundary, concurrency, quantity, and package limits. |
| P-02 | Gate Automation by Plus; debit credits only for paid service steps. Local-only workflows use no credits; depleted workflows wait at paid steps without silent quality changes. | Expanded by P-19/P-20 and Execution OP-P01–02; still proposed. Estimates, caps, reservation/debit/refund, in-flight work, and expired-package behavior require Q-05 approval. |
| P-03 | Main Douyin action opens an authorized login browser; cookie import is advanced. Separate app profile; keep sessions local; headed fallback for verification. | Main connect/reconnect and advanced-cookie entry accepted by D-32/C-24. Separate profile, persistence, secret storage/erasure, runtime behavior, and live R-01 tests remain open. |
| P-04 | Editor/batch/Automation share processing capabilities and step artifacts; isolate failing videos and resume affected work. | Item/source/provider failure boundaries, cancellation/retry, dependency invalidation. |
| P-05 | Allow optional processing steps rather than forcing STT → translation → TTS. | Workflow optionality confirmed by D-24; internal pipelines, original voice, generated scripts, and dependencies remain open. |
| P-06 | Hybrid per-step local/cloud execution with visible placement and waiting states; no default cookie upload. | Transfers, consent, uploaded-data readiness, privacy, cost, and recovery. |
| P-07 | Folder watchers and newly eligible Library content as triggers. | Inputs confirmed by D-23; incomplete files, initial scan, deduplication, edits, and loops remain AU-Q01. |
| P-08 | One future wallet for premium AI and cloud resources. | Compute/storage/orchestration units, included resources, and charging policy. |
| P-09 | Sample previews, direct lightweight updates, valid caching, and selective recomputation. | `ED-P02`; no approved ten-second default, latency SLA, or automatic paid preview. |
| P-10 | Panel-based Editor and detailed five-area UI behavior. | Subtitle behavior confirmed in D-19–D-21; Sources/Library flows and defaults in D-32–D-36. Geometry, video/audio controls, and unseen module defaults retain their status. |
| P-11 | Timed OCR, repeated-frame deduplication, separate OCR/STT provenance, reuse detection where valid. | SRT confirmed for subtitle tracks; scene-text/TXT outputs, algorithms, and thresholds remain open. |
| P-12 | Shared category/tag catalog, Library persistence, no per-item classification gate, and unclassified results when evidence is insufficient. | Shared catalog and manual in-context creation/selection confirmed by D-39. Other `CA-P01–04` details, initial taxonomy, auto-created tags, category count, confidence policy, and fallback branches retain their stated status under Q-09. |
| P-13 | Workflow list/block configuration/run detail, dry-run separation, dependencies, snapshots, loop protection, and item-level recovery. | `AU-P01–05`; routing choices now D-28–D-29, other operational policies remain AU-Q01–04. |
| P-14 | Detailed Channels/Shopee tables, authorization UX, post-state presentation, history coverage, link/post edit and deletion policies. | `KC-P01–06` and KC-Q01–05. Do not infer current API capabilities. |
| P-15 | Deterministic routing tie-breaks, stable rotation state, cross-rule destination deduplication, concurrency-safe assignment, and expanded trace explanations. | `AU-RT-P01`; accepted choice modes are not an approved allocator algorithm. |
| P-16 | OS-derived first-launch locale, saved preference, English fallback, stable localization resources, and bilingual acceptance coverage. | `NAV-L10N-P01`; D-31 confirms bilingual support, not every proposed UX/runtime detail. |
| P-17 | Detailed Sources/Library states, asset relationships, identity/version checks, partial-file recovery, naming safety, and active-use deletion protection. | `SL-P01–05`/SL-Q01–04; D-32–D-36 approve discussed behavior, not every file/retention/runtime policy. |
| P-18 | Contextual model-install states, deduplicated downloads, default-setting snapshots, folder changes without migration, and active-use protections. | `ST-P01–02`/Q-11; D-37–D-39 approve the simpler experience, not every lifecycle, precedence, or billing policy. |
| P-19 | Separate Plus, credits, network, execution environment, and account permissions; hold affected work, allow no-credit local automation with valid Plus, stop new automation dispatch on expiry, and use bounded offline authorization. | Proposed OP-P01 in `specs/execution-policy.md`; extends P-02, not an approved plan/expiry/grace rule. Residual-credit access and offline validity remain OP-Q01/Q-05. |
| P-20 | Enforce paid-step estimates/caps, concurrent reservations, stable request identity, once-only customer settlement, and reconciliation before retry or release of uncertain reservations. | Proposed OP-P02; pricing, units, partial/failure charging/refunds, and hold limits need OP-Q01/Q-05 approval and R-15 evidence. No actual billing system is tested. |
| P-21 | Contextual consent for resident window-close behavior; explicit Quit stops local work; checkpoint/reconcile recovery; bounded source catch-up and next-permitted-slot handling of unsubmitted missed recurring posts. | Proposed OP-P03–05; visible lifecycle and public-action defaults still need OP-Q02 approval. OS/runtime/native-schedule support and slot-allocation algorithms require verification. |
| P-22 | Reuse-first editor/worker integration target: timeline component, waveform/regions, ASS preview, Python subtitle I/O, native FFmpeg, and OCR/inpainting adapters. | [ARCHITECTURE.md](ARCHITECTURE.md) v0.2 and [research/reuse-audit.md](research/reuse-audit.md). Component choices are recommendations, not installed-application or model evidence. Commercially restricted SDKs are not automatically authorized. |

## 4. Open questions

The owner decides material product/UX/commercial changes. Agents research implementation choices and prepare evidence; do not ask the owner to pick every library or field.

| ID | Unresolved scope | Output / responsibility |
|---|---|---|
| Q-01 | Video/audio tools, track/clip behavior, batch application, preview defaults, alignment, configuration versions, recovery, and subtitle edge cases. Optional profiles, real preview, OCR, and subtitle editing are already confirmed. | Editor ED-Q01–05; owner decides consequential UX, agent drafts/tests. |
| Q-02 | Initial intake scope, trigger detail, polling, schedule timezone/catch-up, preview priority, retries, pause/cancel, duplicate/loop control, and precise routing allocator behavior. Input/endpoint flexibility and routing modes are confirmed. | Automation AU-Q01–04/AU-RT-P01; proposed lifecycle/recovery and missed-post policy in Execution OP-P03–05/OP-Q02; R-10/R-11/R-15. Not approved by the request to draft. |
| Q-03 | Target hardware, video lengths/types, quality, manual correction tolerance, speed, and benchmark fixtures. No numeric targets yet. | Shared target definition; agent measurements and support matrix. |
| Q-04 | File/content identity/versioning, deliberate-copy grouping, relink validation, project/variant lifecycle, cache/retention, collisions, deletion/recovery, synchronization, and historical post/link retention. Reference-first/optional copy, reuse choices, and separated deletion with dependency visibility are confirmed; do not ask those again. | Sources/Library SL-Q01–04; AU-Q01; KC-Q01. Agent proposes mechanisms; owner approves unresolved destructive/UX consequences. |
| Q-05 | Plus price/period, credits, top-ups/expiry/rollover, estimates/debits/refunds, limits, offline entitlements, and expired balance/package behavior. | Proposal now drafted in `specs/execution-policy.md` OP-P01–02/OP-Q01; approval and contracts remain needed. No assumed monthly subscription, grace duration, residual-credit rule, or unlimited credits. |
| Q-06 | Product uncertainty, post templates/default precedence, link placement, count filtering for removed/cancelled records, URL changes, post/schedule editing/cancel, and externally created post coverage. Channel/Shopee configuration and routing choices are already confirmed. | Channels KC-Q01–05, Automation §10, platform verification R-02. |
| Q-07 | Eligible cloud steps/schedules, upload consent, sensitive data, storage/retention, budgets, and offline desktop behavior. | Cloud scope and evidence; proposed local/remote lifecycle boundaries in Execution OP-P03–04. No cloud stack or unproven 24/7 promise. |
| Q-08 | Within the D-40 Electron/React/TypeScript + Python/native direction: exact media/UI components, model/runtime bindings, database/backend/scheduler details, authentication, billing integration, packaging, and update/distribution. No Rust choice remains open. | Architecture v0.2 and P-22 give integration targets; R-16 does not validate packages/models or target desktop builds. |
| Q-09 | Initial category/tag catalog, hierarchy/cardinality/language/aliases, automatic label creation, merge/delete behavior, missing/conflicting evidence, and rules requiring classifications. Shared catalog and manual in-context creation/selection are confirmed by D-39. | Content Analysis CA-Q01; R-09. Bilingual UI does not settle taxonomy-language policy; do not restore a mandatory Settings catalog setup. |
| Q-10 | Initial UI locale, switching/restart behavior, fallback wording, built-in taxonomy translations, locale formatting, and language-resource test implementation. | Screens NAV-L10N-P01; Settings ST-Q01. English/Vietnamese support and the language entry under General are confirmed. |
| Q-11 | Contextual model recommendation/install/update/removal/resume, installation state, default-folder/configuration precedence, and exact advanced controls. Three-group Settings and no long setup wizard are confirmed. | Settings ST-P01–02/ST-Q01; R-05/R-13/R-14. Background execution remains Q-02/Q-07 and billing Q-05, not newly approved defaults. |

## 5. Verification register

**No application build, model benchmark, or live integration test has been evidenced by this documentation package.** Earlier assistant statements about blocked CLI paths or headless success are not operational evidence; recheck the source/version/environment before repeating them as facts.

| ID | Hypothesis to verify | Required evidence |
|---|---|---|
| R-01 | Authorized Douyin browser/cookie access; later RedNote. | Single/shared/channel links, metadata, pagination, headed/headless, persistent login, expiry/verification, retry/deduplication; separate documentation from live authorized tests. |
| R-02 | YouTube/Facebook Page connection, publishing, reading state/history, links, and scheduling. | Current official permissions/auth/token/quota/format/link-placement/scheduling documentation; permitted live publishing/readback tests; uploaded vs scheduled vs published; unknown outcomes and duplicate-safe recovery. |
| R-03 | Video text/watermark removal. | Fixed/moving regions, complex backgrounds, temporal consistency, speed, RAM/VRAM, runtime, code/weights licenses. Image-only demos are insufficient. |
| R-04 | STT/translation/TTS/alignment for Vietnamese and English outputs. | Representative source languages, names/terms, timing, manual correction, voice quality, CPU/GPU, provider prices/quotas, and licensing. |
| R-05 | Packaging and operation on target hardware. | Actual OS/runtime/machine matrix; CPU-only/acceleration, downloads, memory/disk, concurrency, preview/export, crash recovery, and redistribution. |
| R-06 | Standalone video OCR and purpose-aware detection. | Burned-in subtitles/scene text, multilingual timing/deduplication, moving text, no-target cases, accuracy, speed/memory, licenses; non-text logos evaluated separately. |
| R-07 | Sample-preview correctness and edit-loop responsiveness. | Sample/full-output agreement, boundaries/flicker, stale jobs, configuration/model changes, memory/cache, batch contention, cancellation/timeout costs. No SLA yet. |
| R-08 | Simpler UI without weakening target tasks. | Prior package records a public CapCut/DaVinci documentation review dated 2026-09-15; sources in Editor §9. No app usability audit; prototype task tests still needed. Translation is not a fresh source check. |
| R-09 | OCR → category/tag classification. | Separately measure OCR and classification: languages, no text/noise, multiple/out-of-catalog topics, wrong/abstained labels, aliases, evidence, cost/performance, licenses. |
| R-10 | Flexible automation intake, endpoints, and recovery. | Partial/renamed files, repeated events/pagination, initial scans, output loops, multiple rules, versions, offline/catch-up, failures, crash/paid/publishing timeouts; test all endpoint types. |
| R-11 | Routing → destination post → schedule → reverse link usage consistency. | Fixed/matched/rotating/all-authorized modes, missing evidence/rights, ties/concurrency, retry, frozen choices, counts/list filters, multi-channel partial outcomes, no-side-effect rule tests. Live publishing remains R-02. |
| R-12 | English/Vietnamese UX and data integrity. | Five areas plus shared states; switching without content/rule/schedule changes, diacritics, long labels, fonts, search, file/SRT/profile round-trips, formatting, fallback, accessibility labels, and localized errors with stable identifiers. |
| R-13 | Source intake and Library file lifecycle. | Reference/copy/relink, file identity/versioning, duplicates/collisions, partial writes, disk/permissions, removable locations, Unicode paths, manual/automatic overlap, shared dependencies, safe deletion, and crash recovery on the supported desktop matrix. Live source access remains R-01. |
| R-14 | Simple Settings and contextual setup without hidden loss of control. | Missing/interrupted/duplicate model installs, readiness/compatibility checks, insufficient resources, independent-tool access, recommendation behavior, default changes, advanced controls, and bilingual task continuity. Separate usability checks from model performance and live billing evidence. |
| R-15 | Execution gates, credit settlement, lifecycle, and schedule recovery. | OP-AC01–16: entitlement/clock/offline boundaries, concurrent reservations, unknown external outcomes, expiry in flight, resident/quit/sleep/crash behavior, missed slots, backpressure, unchanged post/link identities, and bilingual status. Separate deterministic mocks from authorized OS/provider tests; no such tests have run. |
| R-16 | Reuse-first Editor/Python audit and bounded media check. | Source/manifests/license review for timeline, waveform/subtitle tools, VSE/VSR, RapidOCR, and alternative SDKs. Eight native-media checks passed on synthetic Linux media; no React/Electron, PyAV/pysubs2, OCR, LaMa, packaging, or performance benchmark completed. See [audit and evidence](research/reuse-audit.md). Pin artifacts and validate target OS before production selection. |

### Research leads, not approved components

| Area | Leads from the brief/conversation |
|---|---|
| Douyin | GitHub `jiji262/douyin-downloader`. |
| Text/watermark processing | LaMa, ONNX/ONNX Runtime, OpenCV; distinguish models, formats, runtimes, and processing libraries. |
| STT and text tasks | Local Whisper; DeepSeek for appropriate text tasks, not automatically STT or TTS. |
| TTS | Hugging Face `doof-ferb/nghitts-copy`, Vbee, ElevenLabs, and alternatives with better evidence. |
| Desktop | Electron/React/TypeScript direction accepted in D-40; historical shell comparisons are no longer an open language-selection exercise. Component/packaging verification remains open. |

Broaden discovery across web/GitHub/Hugging Face/Chinese sources/Gitee/ModelScope/communities. Follow leads to original docs, repositories, model cards, licenses, and experiments.

Record: `R-ID | source | checked date | version/commit | claim | code/weights license | environment/fixtures | measured result | limits | recommendation`. Mark untested work explicitly; never infer current price/quota/policy from memory.

## 6. Superseded or corrected directions

| ID | Earlier direction | Current authority |
|---|---|---|
| S-01 | Separate local / user API key / app-credit product paths. | D-05: Free/Plus; no standalone AI BYOK branch. |
| S-02 | Prematurely narrow the product to localization and defer the rest. | D-02–D-03: preserve full scope and both pillars; release sequencing is a separate decision. |
| S-03 | Douyin as the central/required input, user videos as fallback. | D-04: both are first-class inputs. |
| S-04 | Pro treated as an additional plan. | D-05: use Plus consistently. |
| S-05 | Mandatory profile selection/creation before editing or batch. | D-13: direct settings, optional reusable profile files. |
| S-06 | Automatic detection followed by required manual region review. | D-16: auto runs through; manual selection is a separate mode. |
| S-07 | A few AI buttons, style controls, or a small text tab as the whole Editor. | D-19–D-21: real subtitle editing; undecided video/audio tools are not removed. |
| S-08 | OCR only feeds text/subtitles, without classification. | D-22: add the independent category/tag branch. |
| S-09 | Automation always runs from Douyin to publishing; earlier endpoints count as incomplete. | D-23–D-24: flexible inputs/steps/endpoints and distinct watcher/item lifecycles. |
| S-10 | Vietnamese as the canonical language of the delivered specification files. | D-30: English canonical docs from v1.4; D-31 still requires both English and Vietnamese product UX. |
| S-11 | Many primary Settings groups, a technical onboarding tour, and a separate catalog setup as the normal user path. | D-37–D-39: three primary groups, collapsed Advanced, contextual setup and label creation; preserve technical capabilities and safeguards behind the simpler interface. |
| S-12 | Add Rust media core/compositor or reserve a later Rust rewrite because of unmeasured performance concerns. | D-40: no Rust project component/roadmap. Optimize the accepted stack; native third-party libraries remain reusable. |
| S-13 | Declare the timeline, subtitle parser, and compositor first-party implementations before checking reuse. | D-41/P-22: reuse mechanics and render libraries; write product-specific semantics/adapters only where needed. A component is not a complete Editor. |

## 7. Updating this log

Preserve IDs. Record date, evidence, reason/consequence, and superseded IDs for changes. Promote proposals only with explicit evidence and links; do not erase their history. Update Scope and derived specs when the change is confirmed. Low-risk reversible assumptions may proceed when recorded; scope, money, privacy, deletion, or public actions need approval.

| Package revision | Recorded changes |
|---|---|
| 1.1 | C-09–C-14, D-13–D-18, P-09–P-11, R-06–R-08, S-05–S-06; screens and Editor drafts. |
| 1.2 | C-15–C-17, D-19–D-22, P-12/Q-09/R-09, S-07–S-08; full subtitle editing and OCR classification. |
| 1.3 | C-18–C-19, D-23–D-24, P-13/R-10/S-09; flexible Automation spec and partial resolution of P-05/P-07. |
| 1.4 | C-20–C-23, D-25–D-31, P-14–P-16, Q-10, R-11–R-12, S-10; Channels/Shopee, accepted routing, English translation of all eight files, and bilingual UX. Q-02/Q-06 updated to avoid asking already answered questions. |
| 1.5 | C-24, D-32–D-36, P-17/R-13; English Sources/Library spec, accepted local-import and deletion-boundary defaults, partial resolution of P-03/Q-04, and synchronized cross-module references. Bilingual UX and all earlier scope remain intact. |
| 1.6 | C-25–C-26, D-37–D-39, P-18/Q-11/R-14, S-11; simplified Settings/contextual setup spec, shared inline labels, synchronized references, and retained open runtime/credit policies. Ten English Markdown files; English/Vietnamese UX remains required. |
| 1.7 | C-27 and proposed P-19–P-21/R-15; English Execution, Credits & Recovery spec with 16 unexecuted acceptance scenarios. Cross-module references synchronized. No confirmed D-* decision added and no new commercial or background default approved; Q-02/Q-05/Q-07 remain open. Eleven English Markdown files. |
| 1.8 | C-28–C-30, D-40–D-41, P-22/R-16/S-12–S-13; integrated architecture v0.2 and reuse audit, no Rust, Python production workers, eight narrowly scoped native-media checks. Existing business policies/spec IDs preserved; no target-desktop/model validation claimed. |

No revision establishes pricing, hardware guarantees, or successful application/API tests. D-40 accepts the technology direction; specific dependencies, licenses, and distribution combinations still require validation.

## 8. Integration evidence addendum — 2026-09-15

**R-17:** bounded implementation following the owner's agreement to the first integration exercise. Source, contracts and task plan are delivered; see [results](research/integration/RESULTS.md) for 28 passed / 1 skipped local checks and the incomplete UI/model/target-OS gates. This creates no additional confirmed D-* product policy.

**Reversible exercise choices:** integer-ms cue exchange; stdio NDJSON v1; a serial bounded volatile worker queue; source IDs registered by the trusted host; private output cache; MP4 review/FFV1 correctness presets. These are integration details, not final project/profile/job schemas, concurrency entitlements, shipping-codec choices or delivery guarantees. Original product scope and proposed commercial/lifecycle rules remain unchanged.

## 9. Integration 0.2 addendum — 2026-09-15

**R-18:** latest-stable source audit, Reupmatic branding, Lefthook/Biome and Python lint configuration, CI/update PR configuration, render-request ordering and range-response regressions. See [dependency audit](research/dependency-update.md) and [current results](research/integration-0.2/RESULTS.md): 41 passed / 1 skipped local tests. Registry/tool installation, formatter output, upgraded whole-app build, UI and target-platform tests remain unverified.

The named package targets are not a verified lockfile. Source-only CI/update files have not been installed in an account. D-40–D-41 remain unchanged: no Rust, no bespoke video engine, production Python workers, reuse-first. Open commercial/execution policies were not approved by this maintenance request.

## Integration 0.3 implementation note (not a new confirmed product decision)

The accepted Reupmatic/no-Rust/reuse-first/tooling direction is unchanged. A bounded render coordinator and single-video project schema are implemented and locally tested as described in [current evidence](research/integration-0.3/RESULTS.md). Source-only Electron tests use proposed Playwright 1.63.0; compatibility remains unverified. This does not approve full project/profile schemas, commercial rules, automatic background execution or any new paywall. Existing confirmed decision IDs are preserved.

## Integration 0.4 implementation note

Owner instruction: continue implementing Reupmatic; dependency setup and end-to-end testing will be handled later by the owner. Preserve all confirmed D-* IDs and existing open product policy. This instruction is not a waiver of release acceptance or approval of pricing/expiry behavior.

A bounded manual-batch journal/UI is implemented, using built-in `node:sqlite`, the existing TypeScript render coordinator and Python/FFmpeg worker. Reversible details: explicit queue start after reopen; one active batch job; stable input snapshots; same-job retry; exclusive folder output commit. These apply to the integration exercise, not production entitlement or full Automation policy. See [batch behavior](specs/batch-jobs.md) and [evidence](research/integration-0.4/RESULTS.md).


## Integration 0.5 implementation note

D-45 records the local-skill request only. Graphite/mint tokens, conservative motion, fallback font policy and the desktop adaptation are reversible design choices. Original attachment provenance is retained in `research/integration-0.5/source-provenance.json`; no source claim about agency price/performance is promoted into product evidence.

Folder intake follows D-23–D-24 and uses the existing batch queue. Source-only developer activation is not a verified Plus product, a new Free right or a decision on expiry/offline policy. First-run scope is explicitly selected; two-second stability, 30-second reconciliation and bounded recursion are engineering defaults. See [folder spec](specs/folder-intake.md) and [current results](research/integration-0.5/RESULTS.md). No registry retry, dependency lock, target-OS test or production deployment is inferred.
