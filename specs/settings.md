# SCR-05 — Settings & First Use

> Implementation note — 0.7.0: The 0.7 source connects UI locale, native-picked default output folders, local model-manifest configuration and runtime details. Account/plan services, complete profile/workflow settings and commercial verification are not connected. Model setup: [local models](../docs/development/local-models.md). This note does not replace the confirmed requirements below.

> Package: 1.8 · Updated: 2026-09-15 · Language: English.
> **CONFIRMED:** three primary groups, collapsed advanced controls, contextual setup, and no long mandatory onboarding wizard.
> Detailed model lifecycle, settings precedence, billing, and background-execution policies remain proposed/open. No application tests or model benchmarks have run.

## 1. Authority and boundaries

This spec owns Settings and contextual setup. Read [DECISIONS.md](../DECISIONS.md) D-37–D-39, [BUSINESS_SCOPE.md](../BUSINESS_SCOPE.md) SC-11/SC-14, and [screens.md](screens.md) NAV-L10N. All labels, prompts, states, and errors support English and Vietnamese; UI locale does not change content language or schedules.

`ST-R*` records confirmed behavior; `ST-P*` records implementation proposals; `ST-Q*` records unresolved decisions. Simplifying this screen does not reduce Editor capabilities or remove recovery, privacy, and resource-management responsibilities.

## 2. ST-R01 — Three primary groups · CONFIRMED

| Group | Visible content and actions | Boundary |
|---|---|---|
| General | English / Tiếng Việt; default save folder. | Do not require a tour of separate download, cache, model, and export directories before work. Exact directory defaults remain open. |
| AI & processing | Installed local tools, download action for missing components, default processing choice, and a suitable configuration recommendation. Detailed model changes are optional. | Do not require users to understand runtimes/GPU settings or select every model first. No separate AI-provider API-key path. |
| Account | Free/Plus status, remaining credits, upgrade, and usage history. | Do not invent prices, billing periods, top-ups, refund rules, or unlimited allowances. |

**ST-R02 — Advanced:** resource controls, concurrency limits, cache, and diagnostics remain available in a collapsed area, not four more primary groups. Do not turn every internal safeguard into a user preference. Exact controls and ranges require hardware/runtime evidence.

Source sessions remain in Sources; publishing authorization remains in Channels. A platform account connection is not the removed AI BYOK branch. Later cloud worker settings must not appear operational before implementation.

## 3. ST-R03 — Start working; install only what is needed · CONFIRMED

Users can enter the application without a long setup wizard, downloading all models, or connecting Douyin. Setup happens when a selected tool needs it; independent available functions remain usable.

```text
Open a video or select another task
  → use the available function normally
  → if a required local component is missing:
      show what is needed + download size + Download action
      → install the required component
      → return to the same task
```

Model setup is not a mandatory visit to Settings. The AI & processing group is also available for proactive management. Compatible-tool recommendations are system responsibilities; this document does not choose a model, runtime, or hardware threshold.

### ST-P01 — Contextual setup details · PROPOSED

| Situation | Proposed response |
|---|---|
| Missing component | Identify its purpose and required downloads; show size when known, otherwise say it is unavailable rather than inventing it. Users may defer without losing their work. |
| Download/check in progress | Show real progress and status in the shared queue; closing a status panel is not a cancellation. Verify usability before showing Ready. |
| Download/compatibility/storage failure | Preserve task settings; explain the affected tool and offer the relevant retry, storage, or compatibility action. Do not block unrelated functions. |
| Repeated requests for the same component | Reuse the existing installation/download task rather than create duplicate downloads. Exact concurrency and retry rules remain open. |
| Existing compatible component | Reuse it; do not ask for another installation on every project or video. Update/removal while in use needs an explicit lifecycle policy. |

Suggested status labels: Not installed, Downloading, Checking, Ready, Needs attention, Unavailable on this device. These are proposed UI states, not a finalized runtime contract. Returning to a task must not create a paid request, upload content, or start publishing without the required authorization. Auto-resume of local tasks after installation remains ST-Q01.

## 4. ST-R04 — Choose premium processing in context · CONFIRMED

A user may select a Plus service at the processing step and see the cost before running it. Settings provides an overview/default choice, not a mandatory detour for every service. A weak device, missing model, or local failure must not silently switch to a paid service.

Prior authorization can cover an automatic workflow within its permitted services and budget; this does not require an approval dialog for every video. Installation, provider selection, content-upload permission, and permission to spend credits are not interchangeable.

Credit estimates, unavailable estimates, reservation/debit/refund behavior, depleted balances, expired Plus access, and offline entitlement checks now have a **proposal**, OP-P01–02 in [execution-policy.md](execution-policy.md); approval remains **Q-05/OP-Q01**. Do not settle them by adding a toggle or inventing a price. Automatic behavior inside a processing tool is distinct from Plus workflow orchestration; tool labels do not settle package limits or create new paywalls.

## 5. ST-R05 — Labels where users need them · CONFIRMED

Users create or select categories/tags while managing a video, Shopee link, or channel. These places share one catalog; a separate Settings catalog setup is not a prerequisite. [content-analysis.md](content-analysis.md) owns taxonomy and classification details.

Manual label creation is not authorization for AI to create categories/tags automatically. Hierarchy, aliases, built-in labels, merging/deletion, and automatic creation remain Q-09. Internal labels do not automatically become public hashtags.

## 6. ST-P02 — Safeguards behind the simple UI · PROPOSED

| Concern | Proposed behavior / existing constraint |
|---|---|
| Change a default | Apply it to new configuration; do not silently mutate saved projects, enabled workflows, or accepted jobs. Explicit overrides/refresh semantics need contracts. This precedence is proposed, not inferred from accepting the simpler layout. |
| Change the save folder | Treat this as a future default, not permission to move/delete existing files. Exact per-project/workflow precedence and migration remain ST-Q01/SL-Q01–03. |
| Clear cache or remove a model | Show affected work and distinguish recreatable data from originals, exports, and manually edited data. File-affecting actions retain D-36 dependency visibility; active-use blocking and removal mechanics remain open. |
| Change language | Follow NAV-L10N; preserve subtitle edits, manual labels, rule identities, costs, and schedules. Language changes must not start processing. |
| Diagnostics and uploads | Redact secrets and obtain the required permission for sensitive content/data. No default cookie upload, paid fallback, or background publishing outside approved permissions. |

These responsibilities belong in implementation/specs, not a mandatory control panel. [execution-policy.md](execution-policy.md) owns the proposed background/quit/sleep and credit/recovery rules. They still need approval; resource scheduling remains open. A simplified Settings screen does not prove always-on automation, and this policy adds no primary Settings group.

## 7. Acceptance checks

`R` covers confirmed behavior; `P` covers proposed details after approval. These are **unexecuted scenarios**, not test results.

| ID | Scenario / expected result | Basis |
|---|---|---|
| ST-AC01 | Open Settings: only General, AI & processing, and Account are primary groups; advanced controls are initially collapsed but reachable. | R: ST-R01–02 |
| ST-AC02 | First use without Douyin or all models installed: open local content/use available functions without a long setup wizard. | R: ST-R03 |
| ST-AC03 | First use of a missing tool: show its purpose, size, and Download action; no demand to install every tool or visit Settings. | R: ST-R03; unknown-size/error details P |
| ST-AC04 | A model download fails or a device cannot run it: retain work and usable independent functions; do not report Ready without verification. | R boundary; P: ST-P01 |
| ST-AC05 | Select a Plus service: cost/permission is visible before execution; local failure never causes silent paid fallback. | R: ST-R04; accounting details Q-05 |
| ST-AC06 | Create/select a category/tag on a video, link, or channel without Settings setup; other relevant selectors use the same catalog. | R: ST-R05; detailed identity mechanics Q-09 |
| ST-AC07 | Change defaults with queued jobs/saved workflows: no silent mutation or movement of existing files. | P: ST-P02 |
| ST-AC08 | Cache/model cleanup reports affected work and never treats originals or edited subtitles as disposable cache. | R: D-36; active-use/removal policy P |
| ST-AC09 | Use all groups, contextual prompts, validation, and advanced controls in English/Vietnamese; preserve user data and media language. | R: D-31 / NAV-L10N |
| ST-AC10 | Open Account: show actual plan/balance/usage where available; do not label unavailable data as zero or fabricate commercial terms. | R: ST-R01 / D-05; unavailable-data UX P |

## 8. Open work, not additional setup screens

**ST-Q01 / Q-11:** model recommendation/install/update/removal/resume mechanics; default folder and configuration precedence; exact advanced controls; preserving work after setup. Agents draft and verify against Q-03/Q-04/Q-08 and R-05/R-13/R-14. Initial locale/switch behavior remains Q-10.

**ST-Q02:** background/quit/sleep and missed schedules are proposed in Execution OP-P03–05/OP-Q02 under Q-02/Q-07; Plus/credit/offline policies are proposed in OP-P01–02/OP-Q01 under Q-05. None is approved merely by creating the draft. Do not ask the owner to reconsider the accepted three-group layout or require these choices before using unrelated tools.

**R-14:** validate contextual setup, failure isolation, usable configuration recommendations, default changes, and collapsed advanced controls on target devices in both locales. No stack/model selection, installation test, or usability benchmark is claimed here.
