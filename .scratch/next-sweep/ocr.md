# OCR: audit findings (2026-09-27)

Source: a code audit by a subagent. `test:core` passed 667/667 and `test:python` passed (318 run,
19 skipped). The agent also ran two scratchpad probes: `fitCoverBand` against dist-core, and a
Python import-cache test. Neither suite catches the findings below.

## H

- **H1 (CONFIRMED, reproduced) A vision or synthesis pack installed during a session is not seen
  until restart.**
  - PYTHONPATH is set at spawn and `find_spec` caches the missing directory
    (`runtime-packs.ts:84-90`, `worker/vision/models.py:19-23`). Same bug as voice H5.
  - Fix: call `importlib.invalidate_caches()` before each probe, or restart the worker after an
    install.
- **H2 (CONFIRMED, reproduced) "Fit to original subtitles" is wrong when the crop cuts the subtitle
  box.**
  - `cover-fit.ts:146-147` falls back to source coordinates when a corner lies outside the crop.
  - Example: with a crop to the top 90 %, the band covers 86.9–94 % while the subtitle occupies
    88.9–100 %.
  - Fix: clamp to the crop before mapping.
- **H3 (CONFIRMED) The fit is computed from the first 20 OCR samples only.**
  - Evidence: `ocr_scan.py:48` builds a 20-sample preview, and `useEditorSession.ts:606` fits from
    it. At the default interval that is the first 10 s.
  - Fix: compute the regions in the worker from every observation, capped at 32.

## M

- **M1** Any edit during a scan makes the result impossible to apply. `ocr-draft.ts:9` requires an
  exact revision match.
  - Fix: check the layer token and the asset instead of the revision.
- **M2** In a composition, OCR runs, then Apply does nothing. Same bug as compositions M5.
  - Fix: block Extract up front and show the reason.
- **M3 (SUSPECTED)** OCR merges every text in the whole frame, so persistent banners get joined into
  cues and the fitted box covers most of the frame (`runner.py:73`, `merge.py:76-88`).
  - Fix: find the subtitle row before merging and fitting.
- **M4 (SUSPECTED)** Boundary refinement runs after progress already shows 100 %, at two FFmpeg runs
  per cue (`refine.py:168-189`).
- **M5** When a language model is missing there is no message and no Set up button
  (`OcrExtractGenerator.tsx:36-39,89-113`).

## L

- L1 The key `cancelling` is missing in en and vi, so the raw key shows. It is shared with voice
  and model setup.
- L2 Many codes collapse into "Processing failed" (`vision/error-message.ts`), and
  `INVALID_REQUEST` is misleading.
- L3 Evidence directories (up to 128 MB each) are never cleaned.
- L4 A cancel shows a red error banner.
- L5 Opening another video does not cancel a running scan.
- L6 (SUSPECTED) Refined cue edges can overlap, or overrun the next sample.
- Policy missing: a fitted band does not re-fit when the crop changes later.

## Checked clean

- Wiring and parameter bounds between TS and Python.
- Result validation.
- Chunking.
- Cancel.
- Model fingerprints and source hash.
- Apply to the displayed layer, with downstream layers marked stale.
- The render-time OCR guards.
- Setup routes and the pack-before-model install order.
