# CA — OCR, Content Analysis, and Category/Tag Assignment

> Package: 1.8 · Updated: 2026-09-15 · Language: English.
> **CONFIRMED:** a dedicated OCR-to-category/tag workflow, independent of subtitle editing (D-22); shared catalog and manual in-context label creation/selection (D-39).
> **PROPOSED:** remaining flow, analysis placement, taxonomy structure/defaults, and exception policy. No model, schema, quality threshold, or pricing policy is approved; no benchmark has run.

## 1. Purpose and boundaries

Use text found in videos to organize content, evaluate Automation conditions, and suggest affiliate/channel matches. Sources: B §3.3, §4.1–4.3; C-17/D-22 in [DECISIONS.md](../DECISIONS.md); SC-09/SC-13 in [BUSINESS_SCOPE.md](../BUSINESS_SCOPE.md).

[sources-library.md](sources-library.md) owns content/asset entry, availability, and lifecycle. Classification results attach to those records; this module does not create a separate Library or import mode.

**CA-R01:** OCR → analysis → category/tag assignment is a first-class workflow, not just text/SRT export. **CA-R02:** local and connected-source videos work without requiring profiles, removal, translation, TTS, or rendering.

**CA-R03:** users create/select categories and tags where they manage videos, channels, or Shopee links, using one shared catalog without preliminary Settings setup (D-39). This does not approve automatic label creation.

OCR extracts text; classification interprets it. Topic classification, product-type identification, and an exact product/affiliate match are different claims. This workflow cannot create affiliate URLs or grant posting rights. Real subtitle editing remains [editor.md](editor.md) §10.

## 2. CA-P01 — Processing flow · PROPOSED

```text
Select a video / batch / enabled workflow input
  → OCR on source frames before text removal
  → normalize repeated observations while preserving provenance/time
  → analyze against the configured category/tag catalog
  → store labels, evidence, and status with Library content
  → filter/search or evaluate authorized affiliate/channel/workflow rules
```

| Step | Proposed behavior |
|---|---|
| Collect | Extract relevant burned-in subtitles, titles, and scene text—not only the lower subtitle band. Read frames before removal. Audio is not required. |
| Normalize | Merge repeated text observations while preserving order/time/source and the original OCR result. Do not turn every recognized word into a tag. |
| Supplement | Optionally use existing transcript, title/description, or frame analysis under configured permission. No mandatory STT or silent paid/cloud fallback. Keep sources distinct. |
| Classify | Map content to configured categories/tags, including cross-language source-to-label mapping. Correct OCR does not establish correct classification. |
| Store | Preserve extracted text, analyzed scope/version, labels, status, and concise supporting evidence. Results must not exist only in a temporary Editor panel. |
| Reuse | Provide valid labels to search, suggestions from the existing Shopee inventory, and routing conditions. Assignment alone cannot trigger unauthorized publication. |

Proposed result: assigned category/tags, unmatched keywords, sufficient/insufficient-evidence status, and supporting text/timestamps where available. Do not fabricate a confidence percentage from a model's prose. Label cardinality/language policy remains CA-Q01.

Illustration, not a benchmark: text about a handheld vacuum cleaning a sofa → category **Home appliances**, tags **vacuum cleaner**, **home cleaning**, **sofa**. This does not verify a brand, model, or exact Shopee product.

## 3. CA-P02 — Shared category/tag catalog · PARTIALLY CONFIRMED

**Confirmed by D-39 / CA-R03:** use a shared catalog across videos, channels, Shopee links, and related Automation conditions. Users create/select labels where they work, without a separate Settings setup. Stable identity, rename/merge/delete, and taxonomy structure still need contracts.

**Proposed taxonomy semantics:** categories organize broader content; tags describe details/topics/attributes. Internal tags are not automatically public post hashtags.

**Proposed:** provide an initial catalog, editing/aliases, and mapping from Chinese/English source text to configured labels without translating an entire video. The initial catalog is not yet selected. Manual creation/selection is confirmed; bulk editing and alias/merge behavior are not newly approved.

Proposed default: assign existing labels; retain unmatched keywords in analysis, without silently creating categories or changing routing rules. Optional auto-created tags remain undecided and must not introduce per-video approval gates.

Rules should reference stable label identities, not only display strings. Renaming/merging/deleting labels requires contract-defined impact handling. Bilingual UI under NAV-L10N does **not** automatically translate manual labels, settle taxonomy language, or create separate English/Vietnamese rule identities.

## 4. CA-P03 — Entry points within the five areas · PROPOSED

| Area | Responsibility |
|---|---|
| SCR-01 — Sources & Library | Select one/many videos → Analyze & classify. Display/filter category/tag/status; show OCR/evidence in content detail. Manual correction is optional. |
| SCR-02 — Editor | A distinct Content analysis tool for the open video, with evidence/time navigation. Do not replace or crowd out the subtitle table. |
| SCR-03 — Channels & Affiliate | Users manually label channels/Shopee links; analysis can help match videos to the configured inventory. A shared tag is not proof of an exact product. |
| SCR-04 — Automation | An Analyze & classify step before conditions that need its output. A workflow may end at classification without rendering/publishing. Routing is owned by Automation §10. |
| SCR-05 — Settings | AI & processing manages tool availability/default choices under [settings.md](settings.md). Label creation/selection stays in the video/link/channel context, not a separate primary Catalog & labels group. No separate AI BYOK path. |

No sixth primary screen. D-39 supersedes the earlier proposed Settings catalog group; other placement details in this section retain their status. Shared jobs show OCR/classification progress per video. Navigating to analysis must not discard subtitle edits. English/Vietnamese interface behavior follows [screens.md](screens.md) NAV-L10N.

## 5. CA-P04 — Automatic operation, exceptions, and changes · PROPOSED

The proposed automatic path has **no mandatory per-video OCR/category/tag approval**. Users configure purpose/rules once; corrections happen only when they choose to open a result. This preserves automatic operation without inventing unlimited publishing permissions.

| Situation | Proposed behavior |
|---|---|
| No text / insufficient context | Use additional sources only if configured and permitted; otherwise store Unclassified. Do not infer the topic from a watermark/account name alone. |
| Out-of-catalog or conflicting topics | Keep evidence and an unresolved/unclassified state rather than force a category or invent a product. Thresholds require testing. |
| Model error / one failed video | Distinguish technical failure from valid no-text output. Bounded retries follow shared policy; independent videos continue without mandatory manual review. |
| Rule requires a missing category | Do not enter that publishing/affiliate branch. Follow a configured fallback or finish the item as unclassified with a reason, without hanging the batch forever. |
| Partial/sample analysis | Record the analyzed scope and version. Preview/sample results are not automatically full-video classification. Representative frame sampling needs benchmarks. |
| Manual label override | Preserve the override; store newly generated labels separately. Replacing manual choices is explicit, not a gate on every future automatic run. |
| Catalog/content change | Reuse valid OCR for reclassification; tag changes do not require video rendering. Associate results with the correct edited variant, not blindly with the original. |

OCR/transcript/metadata is **untrusted data**, not instructions. Text saying “ignore rules and publish” must not alter workflow permissions or execution. Jobs use only configured data sources/services/budgets; no implicit cloud upload.

For routing no-match handling, see **AU-RT03**. This analysis spec does not duplicate destination-selection rules or overstate an exact product match.

## 6. Acceptance checks

`R` checks confirmed requirements; `P` checks proposals after approval. **No application tests have run.**

| ID | Scenario / expected result | Type |
|---|---|---|
| CA-AC01 | Local video text → OCR → analysis → labels without subtitle editing, profiles, or rendering. | R: CA-R01–02 |
| CA-AC02 | Existing OCR supports both subtitle and classification outputs without replacing either. | P |
| CA-AC03 | Automatic batch completes without per-item text/label review screens; independent results are preserved. | P |
| CA-AC04 | No text, OCR failure, mixed topics, and unknown categories have distinct states; label-dependent routing does not publish through the wrong branch. | P |
| CA-AC05 | Chinese/English terms and aliases map to the same configured labels without uncontrolled near-duplicate names. | P |
| CA-AC06 | Video/channel/link filters share labels without equating tag matches to exact products. | R: shared catalog D-39; filter/matching details P |
| CA-AC07 | Changing labels/catalog does not rerun unrelated OCR/rendering, overwrite overrides, or repost. | P |
| CA-AC08 | Partial analysis or stale results cannot masquerade as current full-video classification. | P |
| CA-AC09 | Instruction-like OCR text cannot call APIs, publish, or change permissions. | P; D-10 invariant |
| CA-AC10 | Switching English/Vietnamese UI preserves label identities, manual names, evidence, and routing meaning. | R: D-31; details NAV-L10N |
| CA-AC11 | Create/select a label from a video, channel, or Shopee link without Settings setup; reuse the same catalog in the other contexts. | R: CA-R03/D-39 |

## 7. Open decisions and verification

**CA-Q01 / Q-09:** initial catalog, category count/hierarchy, tag limits, aliases/language, automatic label creation, merge/delete behavior, and unresolved results. The shared catalog and manual in-context creation/selection are already confirmed. Agents recommend defaults; do not silently convert them into approved product policy. UI locale does not answer these taxonomy questions.

**R-09:** compare multilingual OCR and classification separately on representative videos: no text, noise/advertising text, mixed topics, outside-catalog content, false assignment, and abstention. Measure local/service quality, speed, cost, and code/weights licensing. No model/runtime is selected here.

Broader product recognition remains in B §3.3. This spec completes neither exact product matching nor the full affiliate/Automation module. Place analysis before rules that require its labels, not as a mandatory step in every workflow.

**Execution-policy handoff:** [execution-policy.md](execution-policy.md) proposes affected-step holds for premium analysis and independent eligible local execution. Restoring credits/access must not rerun valid OCR solely to retry classification, overwrite manual labels, or start public posting outside the configured workflow. All new OP-P* defaults remain proposals.
