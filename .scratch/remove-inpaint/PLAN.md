# Remove object removal; cover burned-in text with a subtitle cover band

Owner decision (2026-09-27): drop object removal (LaMa inpainting) entirely. It is too slow on CPU
(~4.3 s/frame, so a 30 s short takes about an hour) and not worth the cost. Users cover the original
burned-in subtitles with the new subtitles instead. That needs subtitle styling with a background,
size and position that can reliably hide the old text. PLAN.md item D1 is dropped with this.

## 1. Remove inpainting everywhere (greenfield: no shims, no migration)

Every surface below goes, together with its tests, fixtures, copy (en + vi) and docs:

- Recipe/contract: `InpaintOptions` and `inpaint` in `app/core/processing/recipe.ts`,
  `worker/processing/recipe.py`, `contracts/processing*.schema.json`, `project*`, `batch-submit*`,
  `folder-create*`, `worker-request*`, `contracts/README.md`, `scripts/sync-contracts.py`. A project,
  profile, batch or folder rule that still carries `inpaint` is an unsupported format and fails
  loudly.
- Worker: `media.inpaint`, `LamaAdapter`/`lama_signature`, the inpainting status branch in
  `worker/vision/models.py`, the inpaint paths in `worker/vision/{service,runner,configuration}.py`,
  `worker/processing/{service,chunks}.py`, `worker/media/render_source.py`, and the operations
  registry.
- Host/UI: the Clean-up tool (rail entry, `VisionPanel`, `InpaintControls`, `InpaintRegionOverlay`),
  the inpaint parts of `useVisionJob`, `EditorExportDialog` (step summary), `MediaStage`,
  `useEditorSession`, `ProcessingOptions` (batch/folder/automation), `profile-document.ts`,
  `batch-queue.ts`, `render-coordinator.ts` (`COMPOSITION_PROCESSING_UNAVAILABLE` keeps only OCR if
  still relevant), `app/electron/features/vision/ipc.ts`.
- Models: the `lama-onnx-fp32` catalogue entry and the inpainting model kind in
  `model-catalogue.ts`/`model-installer.ts`/`models.ts` operations. Also the Settings rows
  ("Object removal") and `OfferedModels`.
- Tests: `tests/e2e/models/editor-models.test.mjs` exports without object removal (it can use the
  original 8 s 720×1280 fixture again).

**Stays:** OCR text extraction (Transcribe → Extract text, `media.ocr.extract`) and `recipe.ocr`,
which the render uses to scan subtitles (`ocr_cue_count`). The vision runtime pack stays for OCR. Drop
from it any distribution that only LaMa needed, and report the size change.

## 2. Subtitle cover band

Today the subtitle background (`box_color`/`box_opacity`, ASS opaque box) hugs the new text. When a
new line is shorter than the burned-in original, or between cues, the old text shows. Add a
**cover band**: a solid rectangle drawn over the video, below the subtitles.

- Settings in the subtitle style: `cover` = `null` | `{ x_pct, y_pct, width_pct, height_pct,
  color, opacity }` (0–100 % of the frame; opacity 0–1). The contract is one shape, validated in core
  and in the worker.
- Default when enabled: a full-width band at the bottom sized to the current subtitle position, colour
  `#000000`, opacity 1. It is shown for the whole video (old subtitles change between the new cues).
  Showing it only while a cue is on screen is left as a possible later option. Report it, don't
  build it.
- Style tool: a CheckboxInput "Cover original subtitles" plus the fields. The live monitor draws the
  band and lets the user drag/resize it, reusing the region-drag interaction from the removed Clean-up
  overlay (move it into the style feature rather than deleting it). Fields and drag stay in sync.
- Render: FFmpeg `drawbox` (or `color` overlay) before the subtitle burn, in the same geometry space
  as the live preview (after crop/fit). Apply it to compositions too. SRT export ignores it; the
  existing "SRT won't keep this style" note covers that.
- Check that size (`font_size_pct`), position (9-grid + margins) and the text box stay easy to reach
  in the Style tool, and that they show live.

## Verification

`check`, `typecheck`, `test:core`, `test:bridge`, `test:python`, the e2e files touched (one at a
time), and `test:e2e:models` once (the real-model flow, now exporting with a cover band). Screenshots
(en + vi): the Style tool with the band on, the monitor with the band covering burned-in text, and
the exported frame.
