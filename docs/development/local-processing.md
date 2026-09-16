# Local processing — 0.9.0

Processing is optional and off by default. It uses configured local models and
the existing worker queue, never cloud calls, billing, downloads or posting.
Read [local-models.md](local-models.md) before configuring actual artifacts.

## Use the existing workflows

In Editor, open a video, choose steps under **Processing recipe**, and explicitly
render a sample or the full video. A selected recipe is part of the project:
all projects use the current v4 schema, with processing, composition and independent text layers optional. Older formats
are rejected, not migrated. Loading a project only restores data. Model selection is resolved when rendering, not when
opening the project. Manual sample OCR still creates a separate reviewable draft.

In **Automation → Batch & jobs**, choose local videos or stage Library selections,
select the output directory and any per-video SRT, then choose the recipe before
**Add to queue**. The one recipe applies to that submission's selected videos.
Source/SRT identities, recipe and required model fingerprints are saved per job.
The queue must be started explicitly. It is not a second editor or a workflow DAG.

In a developer folder rule, save the recipe alongside the source/output folders
and first-run scope. Start monitoring and start the same queue separately. A stable
file is admitted once with the rule's original recipe and model pins. Restart
leaves both monitoring and queue dispatch paused. Folder support still requires
`npm run start:automation`; this developer gate is not production Plus permission.

## Execution order and source protection

The worker verifies input identities and required models. OCR reads the original
source first and generates timed display captions. Optional LaMa then removes
text using per-frame detection or a manually chosen normalized rectangle. The
final encoder burns generated captions or the explicitly attached/manual track.
The source video and imported SRT are never replaced.

Automatic OCR and an existing Editor cue track/attached SRT are mutually exclusive.
The application rejects that combination rather than guessing which text to keep.
Disable automatic OCR to keep existing subtitles. To replace Editor cues, use the
separate, explicit **Apply OCR draft** action and its undo history.

Generated captions in a processing recipe are currently burned into the video;
this path does not expose an SRT sidecar or silently update Editor cues. Use the
bounded OCR draft workflow to review/edit/export a subtitle track separately.

## Bounded resources and output quality

OCR windows align to the chosen sampling interval, are no longer than 120 seconds,
and shrink to fit the decoded-frame budget even for a square 1920-pixel frame.
Raw buffers remain under the existing two-GiB stage bound including reserve.
Adjacent identical text merges across a chunk boundary only when timing is
contiguous; a blank interval breaks the cue. Automatic assembly allows at most
10,000 cues and approximately one MiB of UTF-8 text.

Removal uses ten-second chunks at 24 fps with the longest edge at most 960 pixels.
Intermediate video is FFV1, without repeated audio encoding; those files are joined
and final video plus original-source audio are encoded once into review MP4.
Audio is AAC-transcoded, not copied byte-for-byte. OCR-only output follows the
existing ordinary review encoder rather than downscaling video to the OCR frames.

Full means full duration, within the 24-hour media bound. It does not mean original
resolution, lossless output, temporal consistency or model quality approval.
Resampling, model behavior, audio sync, variable-frame-rate inputs and target-OS
performance need owner verification. Long operations need free disk for private
frames, joined intermediate video and final output. No implicit retention or
user-file deletion policy is introduced.

The processing parent hashes source/subtitle data at entry and before final
publication. Per-chunk stat checks remain, while whole-source rehashing is not
repeated for every private chunk. Model requirements are verified per segment and
again before final publication. Temporary files are request-owned and cleaned on
success, failure or cancellation; published cache outputs are not user originals.

## Model changes, retry and cancellation

Batch/folder admission resolves and saves exactly the models required by the
recipe. This can wait behind an active worker request. It does not download or
run inference, and an admission failure leaves the existing queue unchanged.
Changing Settings affects future admissions, not already accepted jobs.

`PROCESSING_MODELS_CHANGED` means the installed configuration no longer matches
the saved pins. Restore the original configured artifacts to retry the existing
job, or create a new submission for intentionally changed models. Invalid/missing
model artifacts use the existing specific model errors. Do not remove the database
to bypass a failed identity check. A failed item does not block other valid jobs.

Cancel uses the public render or queue job action. One parent worker request owns
OCR, removal, joining and encoding; cancellation terminates an active inference
child/native process and prevents final publication while uncommitted. It cannot
undo an already published file. A killed application does not resume partial
inference: journaled running jobs become interrupted and require explicit retry.

## Contracts and verification

`contracts/processing.schema.json` defines the data-only recipe; embedded schemas
are checked for parity. Cross-field rules and exact required fingerprint keys are
validated in TypeScript and Python. `models.resolve` and `media.process` extend
the existing protocol; no executable paths, shell flags or provider keys are accepted.

Tests cover snapshots, conflict rejection, current-schema projects, queue propagation,
sampling windows, cue composition, real FFmpeg chunk joins/audio/subtitle timing,
cache identity and cancellation. The AI native tests use controlled SDK doubles,
not real model weights. The environment lacks pysubs2, so its absence is exercised
explicitly; mocked serialization is only a composition test. See the exact
[0.9 evidence](../../research/integration-0.9/RESULTS.md); historical native
processing evidence remains in the 0.8 report.
