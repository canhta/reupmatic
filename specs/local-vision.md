# INT-06 / Local vision slice — integration 0.6

Status: bounded developer implementation; not full INT-06 acceptance.
Authority: ED-R05/06, ED-SUB07, ED-AC18; Architecture §4. Existing business,
licensing, English/Vietnamese and no-Rust decisions remain unchanged.

## Interface and acceptance

`models.status` inspects local configuration and installed packages without loading
weights or downloading. `media.ocr` extracts timed text from a registered source;
`media.inpaint` produces a real, bounded video sample with manual rectangle or
per-frame OCR text masks. All three use the existing Python queue, cancellation
and progress envelopes. No second scheduler, cloud, billing or publishing path.

OCR: explicit en/vi/zh content language; 100–2000 ms sampling; at most 120 seconds,
1200 observations, 100 detections per frame and 1 MiB returned evidence. Preserve
raw observations separately from editable cues. Timing is sampling-resolution,
not frame-accurate. Exact adjacent text is grouped; empty frames break a cue.
No subtitle-purpose classifier or category/tag assignment is claimed.

Inpainting: at most 10 seconds, 24 fps CFR proxy, longest side at most 960 pixels;
whole frame decoded before OCR/removal; RGB image + binary mask to fixed 512×512
LaMa model. Crop with context, preserve aspect ratio using padding, then composite
only masked pixels. Source audio is trimmed and remuxed/re-encoded by FFmpeg.
Manual rectangle coordinates are normalized to the displayed, rotated frame.
Text mode detects all readable text in the frame, not non-text logos. There is no
mandatory region-review step. Temporal consistency and full-video removal remain
unverified/outside this slice. No implicit original-file replacement.

Models: developer-owned JSON manifest selected by REUPMATIC_MODEL_MANIFEST or
`models/local.json`. Only explicitly listed, existing local artifacts with SHA-256
are accepted. Code and weight license provenance are separate. Vietnamese requires
an explicitly configured Vietnamese-capable recognizer/dictionary. No default
Chinese recognizer is silently relabeled Vietnamese. Runner denies Python socket
network operations and subprocess launches; this is defense-in-depth, not an OS
sandbox for hostile native libraries/models. Only trusted models are supported.

UI: contextual setup state, refresh, language selection, independent OCR/removal,
progress/cancel/errors in EN/VI. OCR results are drafts, not automatic edits.
Applying a draft is explicit and undoable; changed source/revision is rejected.
Generated previews cannot impersonate a source or an unprocessed original.

## Test seams and evidence

Use the existing worker NDJSON seam, the new vision coordinator public interface,
and the adapter's image/mask interface. These are engineering choices under the
existing autonomy authorization, not new owner product policy. TDD begins at
`models.status`, then timing/mask geometry, then cancellation/stale-result handling.
Actual FFmpeg tests and controlled inference-adapter tests are labeled separately.
No external tracker or sub-agent availability is assumed. Review standards and
spec compliance separately against the supplied 0.5 archive.
