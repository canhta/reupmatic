# Local processing recipes — integration 0.8

Status: implementation contract for reversible, explicit local execution. This does
not approve commercial rules, downloads, uploads, public posting or background work.
Trace: INT-06/07, ED-R05/06, CA-R01, AU-AC02/07/11; prior bounded vision contracts remain valid.

## LP-01 · One recipe, one execution queue

Editor sample/full rendering, manual batches and developer-gated folder rules share
a versioned data-only recipe. OCR generates and burns captions; inpainting removes
text by per-frame detection or an explicitly selected normalized region. Both are
optional and off by default. OCR runs on the original before removal. Existing cue
tracks or attached SRT conflict with automatic OCR: reject, never overwrite or
silently choose one. Editing controls never start inference.

## LP-02 · Duration, resources and quality boundary

Full means the complete source duration (up to the existing 24-hour media bound),
not full-resolution or temporal-quality certification. OCR uses bounded, sample-grid
aligned windows; removal uses 10-second windows at 24 fps, maximum 960-pixel long
edge. The worker releases raw frames between windows. Lossless intermediate video
chunks are concatenated, then original audio is muxed once with final encoding.
Output remains a review MP4. No frame-interpolation or temporal-consistency claim.
Disk capacity is checked before each stage. No hidden model downloads or substitutes.

## LP-03 · Identity and cancellation

Batch/folder admission snapshots processing parameters and expected model
fingerprints. Retries retain both; changed model configuration fails with a visible
recovery reason instead of silently producing different processing. Editor resolves
the configured models for each explicit render. Every model's bytes, original source
and attached subtitle are checked before use and before publication. Cache identity
includes recipe, model fingerprints, source/subtitle hashes, runtime and algorithm.
Cache manifests must match their complete recipe and output hash.

Cancellation stays on the parent worker request across OCR, removal, concatenation,
encoding and publication. No child queue, native shell commands, unfinished output
publication or cleanup of user files. A failed item must not stop unrelated valid
items. Temporary chunks are owned by the request and removed on every exit.

## LP-04 · UI and current-schema persistence

Use one business-level ProcessingOptions composition in Editor, batch and folder
forms. Astryx CheckboxInput edits the draft; execution or persistence happens only on Run/Enqueue/Save;
RadioList exposes removal mode and its consequences; Selector owns content language;
NumberInput owns precise sampling/masks. Critical limits and conflicts stay visible.
Normal recipe summaries are text in existing tables, not a second dashboard.

All projects use one current version 2 schema with an optional processing recipe.
Unsupported versions fail explicitly; there is no old reader or migration path. A recipe change marks the
Editor dirty and invalidates stale previews. Saving/restoring does not run models.
Saved batch and folder records without a recipe keep their existing behavior. The
folder developer gate, explicit first-run scope and paused-on-restart policy remain.

## LP-05 · Verification boundaries

Contract/core tests establish serialization, pinning, conflicts, unsupported-format rejection, cache
identity and job lifecycle. Native controlled-adapter tests establish actual FFmpeg
stream/chunk/audio/cancellation behavior, not OCR/LaMa quality. Installed UI/Electron,
real model inference and target-platform acceptance are separate owner-run gates.
