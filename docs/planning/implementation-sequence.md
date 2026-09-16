# Remaining implementation order — after 0.15.0

Business authority is `BUSINESS_SCOPE.md`, the numbered decisions and module
specifications. `scope-coverage.md` is the full feature/flow checklist, not a claim
of completion. Plan one vertical slice with UI, core, worker, contracts and failure
states rather than creating more disconnected screens. The next archive is 0.16.

## 1. Preserve and extend the delivered composition foundation

0.12 implements an explicit hard-cut composition document, source ranges/speed,
split/reorder/contiguous join, caption/source clock maps, selected-source audition,
bounded sample assembly, complete dependency reauthorization and known Library
member associations through the existing renderer. Do not rebuild this as a
second queue or count the slice as the whole Editor. Keep transitions/layered
tracks, per-clip effects/AI, composition batch admission, resource budgeting and
VFR/continuous preview acceptance visible. Details: `local-composition.md` in
`docs/development/` and the 0.12 verification/skills records.

## Delivered in 0.13 — independent text and bounded local recognition

Four layers now carry language, provenance and edit/invalidation ownership. The
existing editor and timeline target the selected layer; rendered subtitles remain
explicitly displayed text. Copy previews, reviewed-keep-edits, complete undo,
project schema 4 and SQLite recovery retain manual work. A local CPU recognition
adapter returns timed session drafts through the existing worker queue with model
hashing, cancellation and source-clock validation. Native fixtures and SDK doubles
are not actual language-quality or model-installation approval.

## Delivered in 0.14 — reviewed local translation

A configured bilingual CPU adapter now returns separate timed drafts through the
same queue. Captured source/languages/model/rules, bounded complete output, manual
keep default, confirmed replacement, stale guards, translation provenance and
project schema 5/text layers 2 are implemented. Per-cue translation preserves
clocks but is not voice alignment. Actual model/license/quality and installed UI
checks remain open; see the translation development guide and 0.14 evidence.

## Delivered in 0.15 — local spoken-layer audio drafts

Native model/preset configuration and bounded natural CPU synthesis reuse the
existing worker queue. Captured text/clocks, verified WAV/receipt artifacts,
cancellation, audition/manual review and stale-safe native exports are implemented.
Voice quality, actual SDK/model execution and installed UI remain unverified.
Project schema 5/text layers 2 stay unchanged; audio drafts are session-only.

## Next archive: 0.16 — reviewed voice timing and integration

Start from verified generated segments and recorded source clocks. Add an explicit
previewable timing/alignment plan, correction/rate/pause bounds and source/artifact
invalidation without changing manual words. Show duration conflicts rather than
silently truncating speech or promising lip-sync. Apply through the existing audio /
render recipe, not a second executor. Extend to full-duration mixing, complete
project/source dependencies and then durable batch/Automation speech stages.
Keep original audio and user soundtrack choices recoverable. No hidden downloads,
commercial policy or cloud fallback is authorized.

Installer work and full application E2E are owner responsibilities, not blockers
or substitutes for missing feature implementation. An integration ZIP is not
production delivery or full product acceptance.

## 2. Add speech and text-layer flows

SC-04/05/07: extend the delivered independent text layers and bounded local STT
with the delivered reviewed translation/natural TTS adapters and timing/alignment; then support full-duration
voice mixing through the same recipe and batch boundaries. Preview/apply must not
overwrite manual edits. Models, language evidence and resource budget remain real
acceptance work, not SDK-double claims.

## 3. Complete intake, classification and independent endpoints

SC-01/02/09/13: authorized Douyin/browser-session intake, durable downloads and
Library handoff; OCR-based classification with scope/evidence/manual correction.
Do not infer a product identity from a category. Download-only, OCR-only and
classification-only runs must terminate with their own outputs rather than a
mandatory render or publish step. No authorization/restriction bypass.

## 4. Extend Automation and connected distribution

SC-08/09/10: implement flexible steps, eligibility/routing in Automation, triggers,
schedules/timezone/catch-up, and runtime failure/recovery. Continue using shared
posts, run IDs and the queue. Integrate platform OAuth/capability discovery, upload,
publication/reconciliation only against verified APIs and explicit authorization.
A pending upload or local plan is not confirmed publication; reconcile ambiguous
outcomes before retries. Routing must not live in Channels just because it uses
channel data.

## 5. Complete local resources, account policy and delivery

SC-11/14: model download/update/integrity, disk/RAM/cache management and user-consented
cleanup; account/Plus/credits and settlement only after unresolved policy choices
are approved. Keep Settings to three primary groups with contextual setup. Keep a separate owner delivery checklist for the real dependency lock, installed
Electron/EN/VI/IME/accessibility checks, native packages, signing/licenses and update
behavior. Do not hold feature delivery behind installer or full E2E execution.

SC-12 cloud remains a reserved later extension requiring explicit placement,
consent, lifecycle, retention and contract decisions; it is not a hidden dependency
of local editing. No cloud worker or service is implemented by an empty directory.

## Change discipline

For each slice: identify feature and flow IDs; read their acceptance lists; update
current contracts and callers together; implement the vertical behavior; record
actual evidence or deferred owner checks; then update maps and package the next
minor version. Preserve planned paths and original public assets. Never present
scaffolding, mocked providers, unconnected controls or source-only screens as a
completed product flow.
