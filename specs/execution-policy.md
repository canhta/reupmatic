# OP — Execution, Credits & Recovery

> Package: 1.8 · Updated: 2026-09-15 · Language: English.
> **Draft for approval.** Existing constraints are identified as `OP-R*`; all new defaults are `OP-P*`. The owner's request to continue authorizes drafting, not approval of unseen commercial or background-execution policy.
> No operating-system, provider, billing, or application tests have run. This document selects no SDK, payment provider, runtime, prices, or grace-period duration.

## 1. Authority and scope

This cross-cutting spec belongs to the existing `specs/` group; it adds no screen or Settings category. It covers execution gates, depleted credits, expired Plus, closing/quitting, offline operation, and recovery. Workflow construction/routing remains in [automation.md](automation.md); posts in [channels-affiliate.md](channels-affiliate.md); Settings in [settings.md](settings.md). Read [DECISIONS.md](../DECISIONS.md) P-02/P-19–P-21 and Q-02/Q-05/Q-07.

| ID | Existing confirmed constraint | Authority |
|---|---|---|
| OP-R01 | Free/Plus remain the two modes; Plus includes credits and workflow Automation access. No separate AI BYOK path. | D-05 |
| OP-R02 | Paid actions, uploads, and public posting require authorization; local failure must not silently switch to paid processing. | D-10/D-38; B §4.3, §5 |
| OP-R03 | Retain progress and valid results, and design recovery to avoid unnecessary repeats, duplicate charges, and duplicate posts. A concrete post keeps its destination/link identity on retry. | B §5; D-27 |
| OP-R04 | Local automation is a first-class capability; later cloud is not proof that desktop-dependent work can run with the machine off. Keep the three-group Settings UI and English/Vietnamese support. | D-03/D-06/D-31/D-37 |

**Do not conflate:** Plus entitlement, spendable credits, network access, a running execution environment, and source/channel authorization. Having one does not prove the others. A queued workflow or an enabled watcher is not an already-started processing step.

## 2. OP-P01 — Gate the affected work, not the whole application · PROPOSED

| Condition | Recommended behavior |
|---|---|
| Active Plus, all required permissions/resources available | Execute the configured steps; a paid step also needs its approved budget and spendable credits. |
| Active Plus, insufficient credits for the next paid step | Keep that step waiting and retain valid outputs. Independent local work and local-only workflows may continue without credit charges. Do not skip a required step, downgrade output, or publish an incomplete result. |
| A balance exists but Plus has expired | Hold new workflow intake and undispatched automation steps, including local steps. Keep configuration, files, history, and the recorded wallet visible; do not erase or expire credits by inference. Use of remaining credits outside active Plus remains OP-Q01; do not launch new premium work under an unapproved policy. |
| Plus expires during a started step | Let the current bounded local step finish, or collect the result of an already-authorized external request. Do not launch its next automated step. A batch or entire workflow is not one grandfathered step. |
| Free user or expired Plus opening existing work | Preserve access to original files, projects, exports, and history. Existing Free local functions remain usable. Do not lock data as an upgrade incentive; manual batch/posting limits are still Q-05, not newly decided here. |
| Offline with verifiable, unexpired cached Plus authorization | Permit eligible local-only automation within that authorization's scope and validity. Network-dependent work waits. Do not invent an offline spending balance or extend entitlement from the device clock alone. |
| Entitlement cannot be verified, is revoked, or cached validity has ended | Hold new Plus-gated dispatch and show verification/renewal needed; unavailable account data is not a zero balance or evidence of expiry. Existing Free local functions remain usable. No unlimited offline grace. |

**Started step:** a local execution unit actually dispatched under valid authorization, or an external operation submitted under it; not merely a reserved credit estimate, planned post, queued task, or entire batch. Subsequent chunks/API calls require fresh dispatch checks. Provider acceptance that is uncertain follows OP-P02, not a blind resubmission.

Recommended resume: after credit/access/connectivity is restored, automatically re-evaluate blocked work only if its workflow is still enabled and its original permissions/budget remain valid. Recheck every blocker, input/configuration validity, and schedule. A refill or renewal never re-enables a manually paused/cancelled workflow or grants broader permissions. Do not recompute valid upstream results merely to resume.

For a paid bottleneck, apply bounded backpressure rather than endlessly accumulating upstream downloads/renders. Keep unrelated workflows available; queue/storage limits need engineering evidence, not another mandatory Settings panel. Manual pause/intake behavior remains AU-Q03 and is not silently redefined by entitlement holds.

## 3. OP-P02 — Cost visibility, reservations, and settlement · PROPOSED

Users see the estimate and an understandable reason when work cannot start; bookkeeping stays behind the interface. A manual paid action is authorized in context. An enabled workflow uses its approved services and spending limit without per-video confirmation dialogs.

| Stage / event | Recommended rule |
|---|---|
| Before paid dispatch | Show an estimate; enforce an approved upper spending bound. An estimate is not an exact final charge. If neither a usable estimate nor an enforceable bound is available, hold the paid step rather than show zero or start unbounded work. Do not add automatic top-ups. |
| Competing requests | Reserve allowance against the authoritative wallet and the relevant workflow budget before dispatch. All sessions share that authority; two requests must not spend the same available amount. Reserve a dispatchable unit, not all future calendar posts indefinitely. |
| Local processing | No credits are consumed for a local step solely because Automation called it. This extends P-02 and still requires business approval; it is not a cloud-usage promise. |
| Completed paid operation | Settle once under the approved metering/price policy; release unused reservation. Persist the operation identity and outcome so recovery does not debit again. Exact rates, units, rounding, and evidence remain OP-Q01. |
| Failure/cancel before any external submission | Release the unused reservation; do not charge for a provider request that was never sent. A reservation is not a completed charge. |
| Submitted operation fails, is cancelled, or times out | Reconcile what happened and what was consumed. Do not promise an automatic full refund or a second charge. Provider cost does not itself define customer refund policy; failed/partial-result charging still needs approval. |
| External outcome unknown | Preserve a reconcilable operation record and show status checking. Do not release funds as if nothing happened or resend blindly. Hold duration, escalation, and disputed settlement remain open; avoid an indefinite invisible hold. |
| User deliberately regenerates an output | Treat this as new work with a new estimate/authorization where required. A transport retry or result fetch is not the same as a deliberate new generation. |

Any customer debit remains within the approved bound. If more authorized units are needed, wait before dispatching them; never retroactively increase a user's approved cap. Whether a provider can bound a single request must be verified before offering it under this policy.

Recovery records must associate the item/step, configuration version, authorization/budget, reservation/settlement, and external request reference when available. Preserve the same identity on transport retries; use provider idempotency only where verified. No claim of exactly-once external execution is made. Schema, reconciliation cadence, backend ownership, and numeric limits are contract/architecture work.

Premium previews follow the same rules. Typing, dragging a slider, switching locale, running a rule dry-run, or navigating cannot launch new paid requests. Already submitted, authorized requests may finish; UI cancellation is not evidence that the provider cancelled them.

## 4. OP-P03 — Window close, Quit, sleep, and offline · PROPOSED

| Event | Recommended behavior and user expectation |
|---|---|
| Navigate, close a job panel, or minimize | Keep existing work and enabled monitoring active while the required process/environment remains available. These UI actions are not cancellation. |
| Close the last window with active work or enabled monitoring | Without prior consent for background operation, offer a short contextual choice: **Keep running** or **Quit and resume later**, with a way to dismiss the choice. Background execution must remain visibly discoverable/reopenable and include a Quit action. Do not silently turn closing into invisible always-on execution. |
| Explicit Quit | Respect the exit: stop accepting/dispatching local work, save edits and task state, and stop local workers safely. Do not secretly retain an always-on local service. Warn that already submitted external work or platform schedules may remain active; Quit does not recall them. |
| Crash / forced termination | Recover only state/artifacts that were actually persisted. Do not promise lossless recovery of every keystroke or arbitrary mid-model progress. Partial output is not a completed export. |
| Sleep, hibernation, or shutdown | Do not depend on local execution while the required environment is unavailable. On return, revalidate and recover under OP-P04. Do not wake the machine, install auto-start behavior, or silently prevent sleep as part of this draft. |
| Network unavailable, machine still running | Available local operations continue subject to OP-P01. Downloading, remote verification, premium requests, and publishing wait where a network is required. Losing network is not the same as the whole app quitting. |
| Later cloud / verified platform-native scheduled work | Work already handed off may continue only in its actual execution environment. Show the handoff and last-known state. Do not present cloud or native scheduling as implemented; R-02/Q-07 remain prerequisites. |

The close-window recommendation requires OS/runtime validation. If an environment cannot provide the consented resident behavior, explain that the app must remain open/minimized; never expose a nonfunctional Keep running action. Remembering a choice, tray/menu-bar presentation, and exact save/checkpoint limits remain OP-Q02.

No additional primary Settings section is needed. First-use contextual permission is sufficient; later preference changes, if provided, belong within the existing layout. Keeping a window closed is not a guarantee of execution during sleep, power loss, process termination, or expired entitlement.

## 5. OP-P04 — Recovery and missed schedules · PROPOSED

Recovery order: **restore persisted records → reconcile external outcomes → validate entitlement/budget/permissions and inputs → resume eligible work → apply schedule policy**. Recovery is not another trigger and must not create a duplicate run/post just because the application reopened.

| Situation | Recommended response |
|---|---|
| Interrupted local step | Reuse valid completed steps; resume the interrupted step where supported, otherwise rerun only that step and its invalid dependents. Do not promise every model can resume mid-step. |
| Several reasons block the same item | Keep all blockers, show the actionable reason, and re-evaluate the full set before dispatch. A credit refill alone cannot clear missing Plus, source permission, or file availability. |
| Input/configuration changed while waiting | Do not publish a stale output or overwrite newer edits with a late result. Retain the accepted configuration and flag invalidated work for a deliberate rerun under the owning spec. |
| Missed source checks | Reconcile unseen eligible items within the previously authorized initial/history scope, rather than replay every missed polling tick. Preserve discovery checkpoints and deduplicate; do not expand into unapproved channel history. |
| Concrete post missed its slot and has not been submitted | For a recurring publishing schedule, allocate the next permitted free slot subject to destination limits and existing reservations. Retain the same post/link identity and show original versus revised time/reason. Never publish all overdue posts immediately. |
| Missed one-off post or no eligible future slot | Retain the output/post with **Needs scheduling**. Do not invent a new publication time. Offer a bulk scheduling action; normal auto processing has no per-video approval gate. |
| Post was already submitted or may have been accepted | Reconcile that same external operation before rescheduling or retrying. A local outage, renewal, or missed tick is not permission to create another post. |
| Work resumes after expiry/credits/network recovery | Apply the same missed-slot rules; recovery is not an exception that allows late public posting outside the configured schedule. Future not-yet-missed posts remain at their existing times. |
| One destination fails | Retain independent successful destination outcomes and their usage counts. Recover the affected destination only; do not repeat the whole multi-channel publication. |

Read/write one concrete post and schedule across Automation, Channels, and Shopee reverse usage (D-27). Schedule source, timezone, revised time, actual publication time, and last reconciled status must remain distinguishable. Reassignment and retry do not increase link counts. Routing/slot allocation across concurrent workflows, late-post tolerance, and cadence remain OP-Q02/AU-RT-P01; no numeric defaults are invented.

## 6. OP-P05 — Minimal UX, full visibility · PROPOSED

Use the existing shared queue, workflow/run detail, Account summary, and Channel Upcoming view. Show one concise explanation with the relevant action, such as **Credits required**, **Renew Plus**, **Connect to verify**, **Checking external result**, **Waiting for this device**, or **Needs scheduling**. Detailed diagnostics are secondary, not new mandatory controls.

Differentiate insufficient spendable credits from unknown balance, confirmed expiry from unavailable verification, and waiting from failure/completion. Affected work stays visible with its retained progress. All messages/actions require English and Vietnamese resources under NAV-L10N; these English examples are not final string contracts. Locale changes must not change gates, amounts, timestamps, or execution.

## 7. Acceptance scenarios

These are **unexecuted scenarios**. `R` refers to an existing confirmed constraint; `P` tests a recommended behavior only after approval. Use mocks for deterministic boundaries and authorized OS/provider tests separately; do not report mocks as live verification.

| ID | Scenario / expected result | Status |
|---|---|---|
| OP-AC01 | Active Plus has insufficient credits: paid step waits; independent local work proceeds; no silent fallback or incomplete publication. | P: OP-P01; R: OP-R02 |
| OP-AC02 | Two paid jobs or sessions compete for the final available credits: no double reservation/spend; the blocked request is visible. | P: OP-P02 |
| OP-AC03 | Failure before submission versus timeout after possible submission: release only proven-unused allowance; reconcile uncertainty without blind debit/retry. | P: OP-P02; R: OP-R03 |
| OP-AC04 | Plus expires mid-local render or after a provider accepts a request: collect that unit's valid output; queued/new automated steps do not start. | P: OP-P01 |
| OP-AC05 | Expired Plus still has a recorded balance: preserve work/history/balance; do not infer entitlement, erase credits, or invent a post-expiry spending policy. | P: OP-P01; unresolved OP-Q01 |
| OP-AC06 | Offline authorization is valid, expired, unavailable, or affected by clock rollback: permitted local work follows validity; no indefinite grace or fictitious verification. | P: OP-P01; mechanism unselected |
| OP-AC07 | Restore funds/access while the workflow is enabled versus explicitly paused/cancelled: resume only eligible work; all blockers and permissions are rechecked. | P: OP-P01/04 |
| OP-AC08 | Close panel/minimize/close last window/explicit Quit: match the displayed choice; no undisclosed resident worker; keep or restore task context as actually supported. | P: OP-P03 |
| OP-AC09 | Sleep/forced exit during render: incomplete outputs remain incomplete; valid upstream artifacts survive; restart only affected computation. | P: OP-P03/04; R: OP-R03 |
| OP-AC10 | Network loss with local and remote jobs: local eligible work is isolated; provider/publishing uncertainty remains visible and reconcilable. | P: OP-P01/03 |
| OP-AC11 | Several missed polling ticks and old channel history: one bounded reconciliation obeys prior intake scope without duplicate or expanded discovery. | P: OP-P04 |
| OP-AC12 | Recurring, one-off, and already-submitted posts miss their times: next permitted slot, Needs scheduling, or external reconciliation respectively; no burst or new post identity. | P: OP-P04; R: D-27 |
| OP-AC13 | Local Quit while an external operation/native schedule was accepted: do not claim remote cancellation or premature publication; reconcile on return. | P: OP-P03/04; R-02 verification |
| OP-AC14 | Reconcile a crash between provider acceptance, settlement, and local state save: stable request/post identity; no repeated customer debit or link-count inflation. | R intent: OP-R03; P mechanism |
| OP-AC15 | Change source/configuration while blocked; stale result returns; one of several destinations failed: retain versions/successes and isolate recovery. | P: OP-P04; R: D-27 |
| OP-AC16 | English/Vietnamese UI, dry-run, slider edits, or locale switching during blocked/in-flight work: accurate messages without new paid/public work or altered stored state. | R: D-20/D-29/D-31; P display details |

## 8. Approval and verification still needed

| ID | Remaining decision / evidence | Owner |
|---|---|---|
| OP-Q01 / Q-05 | Approve or revise OP-P01/P02: local no-credit rule, step-boundary expiry, post-expiry residual-credit access, offline-validity limits, prices/units/periods, reservations, failure/partial-output charging/refunds, and reconciliation hold limits. No monthly plan, top-up terms, or grace duration is assumed. | Product/commercial owner; agent prepares evidence and contracts. |
| OP-Q02 / Q-02/Q-07 | Approve or revise window-close choice and missed-post next-slot policy; define bounded intake/dispatch, remembered consent, scheduling conflicts, late tolerance, retry/backoff/checkpoints, OS behavior, and future remote handoff. | Owner approves visible/public-action policy; agent verifies implementation under R-02/R-05/R-10/R-15. |

**R-15:** verify entitlement boundaries, concurrent spending, cancellation/unknown settlement, offline validity/clock changes, resident/quit/sleep/crash behavior, missed schedules, duplicate-safe recovery, and bilingual explanations. Measure on supported environments and provider adapters before claiming reliability.

Approval of the simple Settings screen did not settle these policies. Agents may draft contracts/test plans and use clearly labeled mocks; they must not enforce new commercial rules or public-action defaults as approved production behavior. All remaining pricing, capability, and lifecycle gaps remain explicit; this document is not a completed architecture.
