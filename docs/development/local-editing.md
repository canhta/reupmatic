# Single-source editing — 0.10

Current composition behavior and clock exceptions are documented in [local-composition.md](local-composition.md). The single-source behavior below remains; 0.11 added subtitle styling and 0.12 added hard-cut composition.
Scope: SC-03, SC-05, SC-06 and SC-13; flows 01, 03, 06, 13, 15 and 22.
This is a source implementation, not an assertion of installed Electron or model quality.

## One source clock, one processing recipe

Editor trim, normalized crop, flip, brightness/contrast/saturation, output ratio
and contain/cover sizing, playback speed (0.25–4x), source-audio gain and mute are
stored in `ProcessingRecipe.editing`. Core owns validation and time mapping;
Python mirrors the contract and builds native FFmpeg filters. Invalid values fail
before publication. No script, arbitrary filter, remote URL or model path can be
injected through the recipe.

The original player, waveform, timeline, cues, trim and sample interval all use
**source time**. A sample processes the intersection of sample and trim. An empty
intersection is an error, not a different implicit range. The processed player is
the actual sample/export, not a CSS simulation. Transform controls do not change
the original player live; render a sample to inspect the result.

Pipeline order: source-clock selection; optional OCR of the original and/or
bounded text removal; crop/flip/color/output framing; burn source-timed captions;
reset output timestamps and apply speed; encode once. Source audio follows the
same time interval, tempo and gain, or is absent when muted. Editing without OCR
or removal resolves **zero models**. Existing source, subtitle, runtime and full
recipe hashes participate in cache identity. Cancellation and publication use the
existing worker, renderer and durable batch queue.

Explicit output rate prevents short lossless samples without audio from acquiring
the encoder's default 25 fps clock. Actual tests cover 30 fps edits and the
existing 24 fps removal flow. Variable-rate, unusual rotation/SAR and hardware
format acceptance still require verification; do not infer universal support.

## Saving and reusing settings

Whole-document undo/redo includes cues, sample interval and the entire processing
recipe, bounded to 60 undo states. A branch edit clears redo. Current project v3
stores the snapshot; there is no older-version reader or migration path.

Profiles copy framing/color/speed/source-audio and optional OCR/automatic removal.
Copying the current Editor into a profile explicitly excludes source-specific
trim. Manual removal masks are rejected, not silently reused on other videos.
Batch, folders and workflows receive snapshots of the same recipe. Opening or
applying a profile does not render or start inference.

Editor exports offer source-timed SRT and edited-output SRT. The latter clips cues
to the trim and divides timestamps by speed without changing the editable source
track. Video-plus-SRT atomic paired export is not implemented.

## Display-text operations

Literal/JavaScript Unicode regex replacement supports all cues or the selected
cue, case sensitivity, changed counts and before/after comparison. Preview runs
in a Web Worker with an explicit two-second termination budget. Apply checks the
captured document revision and settings, then creates one undoable edit. The UI
shows the first 25 changed rows; the counted result covers the full selected set.

Bulk time shifts validate all selected cues before changing any. Out-of-source
shifts fail without clamping or partial mutation. These commands affect displayed
subtitles only. Transcript, translation, spoken text, saved rule chains and full
subtitle styling remain separate unimplemented scope.

## Standalone whole-source OCR

`media.ocr.extract` scans the original from zero to its complete probed duration,
independent of Editor trim, manual cues, rendering or removal. It shares bounded
sampling/chunk logic with automatic OCR burning. Adjacent equal-text cues merge
across chunk boundaries; intervening blank observations still split them.

The draft can be exported directly to SRT without applying it to Editor. Applying
remains explicit, confirmed and revision guarded. `pysubs2` is needed for SRT
serialization, but not for extraction itself. Recognition uses configured local
models; no automatic downloads or cloud calls are added.

Raw chunk JSON, `chunks.json` and `summary.json` are atomically published under
`workspace/analyses/<analysis_id>/`. The UI previews at most 20 observations and
reports the complete sampled-frame count. Raw evidence is not truncated: an
operation exceeding 128 MiB of evidence, 10,000 cues or the 1 MiB result budget
fails and removes its staging data. Maximum source duration is 24 hours. Sampling
can miss text shorter than its interval; timestamps are sampled approximations,
not frame-perfect OCR claims. Source/model identities are checked before and after
processing and per-chunk model fingerprints must match.

Full-duration inpainting still works at a maximum 960-pixel longest edge / 24 fps.
Output sizing may upscale it but cannot restore missing source detail. Actual OCR
accuracy, LaMa quality and temporal consistency remain unverified.

## Still outside this slice

The 0.11 soundtrack and subtitle appearance slices are documented in
`local-soundtrack.md` and `subtitle-appearance.md`. Multi-clip split/join/reorder,
voice generation, STT/translation/TTS, advanced typography, actual
download/classification connectors and production
scheduling/publishing, resource/account services and native installers remain
tracked in `docs/planning/scope-coverage.md` rather than labelled “waiting for QA”.
