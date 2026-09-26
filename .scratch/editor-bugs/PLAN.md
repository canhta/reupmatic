# Editor bug sweep — plan

Source: owner-requested audit (2026-09-27). Inputs:

- the full e2e run on main (91/102);
- an exploratory crawl of every Editor tool with the real installed models
  (`.scratch/editor-crawl/crawl.mjs`, screenshots in `.scratch/editor-crawl/out/`);
- a wiring cross-check of the 153 IPC operations against the worker's operations;
- code reading.

The sample/preview removal is its own plan (`.scratch/remove-sample-preview/PLAN.md`, worker
`remove-preview`). This plan covers everything else.

Severity: **H** = a feature does not work; **M** = wrong or misleading result; **L** = polish.

## A. Worker and models (independent of the UI refactor)

| # | Sev | Bug | Evidence | Fix expected | Test expected |
| --- | --- | --- | --- | --- | --- |
| A1 | H | Object removal never works. `LamaAdapter` requires input shape `[1,3,512,512]`, but the model the catalogue offers (`Carve/LaMa-ONNX` `lama_fp32.onnx`) declares `['batch',3,512,512]`. Every inpaint job, and every export that uses object removal, fails with `MODEL_SHAPE_UNSUPPORTED`. | `worker/vision/algorithms.py:150-160`; onnxruntime `get_inputs()` on the installed model | Accept a symbolic or `1` batch dimension and keep checking the 512×512 plane, the channels and the float type | Python test with a fake session whose shapes are `['batch',3,512,512]` and one with a real mismatch |
| A2 | M | Settings/Clean-up shows "Object removal: Ready" for a model that cannot run. The status check never opens the session, so A1 only surfaces as a generic "Processing failed" during a render. | clean-up screenshot vs `worker.job-failed MODEL_SHAPE_UNSUPPORTED` | Status validates the model's input signature (cheap: session metadata only) and reports the named code | status test with the incompatible fake model |
| A3 | M | Recognition produces subtitle cues that are too long for short-form video: 6 s of speech comes back as one cue ("Hello and welcome, … thank you for watching", 0–4.8 s). | transcribe screenshot | Split recognised segments into subtitle-sized cues using word timestamps (faster-whisper `word_timestamps=True`), with a max chars/line and a max duration. Leave the limits as named constants and report them for owner review | Python test with fixture words → expected cue boundaries |
| A4 | L | "1 recognized cue(s)" — the count uses "(s)" instead of i18n plurals, in en and vi | transcribe screenshot | i18next `_one`/`_other` keys | locale parity test |

## B. Editor UI (sequenced after `remove-preview`, which rewrites the monitor and the tools)

| # | Sev | Bug | Evidence | Fix expected |
| --- | --- | --- | --- | --- |
| B1 | H | Any document change invalidates a pending transcript result: after an unrelated edit (style, audio, a setting), "Replace transcript" is disabled and the only way out is to recognise again. | transcribe screenshot, stale banner after changes in other tools | Only a change to the target layer (or the source media) makes the result stale; other edits leave it applicable |
| B2 | H | The subtitle overlay renderer (JASSUB) fails with `SecurityError: VideoFrames can't be created from tainted sources`: the `<video>` loads from `media://` without `crossOrigin`, so the frame is tainted. | diagnostic `renderer.console-warning` | Set `crossOrigin="anonymous"` on the monitor video, and make sure the `media://` handler returns `Access-Control-Allow-Origin` for the app origin. Verify the overlay renders with the colour preview on |
| B3 | H | The monitor turned black after Edit-tool changes (colour/crop/fade values set by the crawl). Cause not yet isolated: out-of-range values reach the live preview, or B2. | edit screenshot | Reproduce with each Edit control alone. Number fields clamp to their range before they reach the preview. The monitor never goes black on valid input |
| B4 | M | Clean-up's fixed rectangle (10/70/80/20 %) is not drawn on the monitor, so the user cannot see what will be erased. | clean-up screenshot | Draw the region on the source monitor while the Clean-up tool is open, and make it draggable/resizable. The fields stay as the precise input |
| B5 | M | Each tool applies changes in a different way. Audio's mute applies instantly while Audio's Apply/Revert stays disabled. Style needs "Apply appearance". Edit is live. | audio, style, edit screenshots | One rule (AGENTS.md "Controls follow one rule"): editing controls apply live to the document with undo. Remove the per-panel Apply/Revert pairs, or keep them only where a change is expensive, and document which |
| B6 | M | Style validation is one generic message ("Check font name, hex colors and numeric ranges") with no field marked. | style alert | Validate per field with inline errors; unknown fonts are rejected at the field |
| B7 | L | Audio shows a disabled "Remove" when no music track is selected | audio screenshot | Hide the action until a track exists |
| B8 | M | Post editor doesn't reload export choices when the library changes (`PostEditor.tsx` effect with `[]` deps) | code | Already in `remove-preview` slice 3c |
| B9 | L | The export step summary doesn't list voice and logo, though both are rendered | `EditorExportDialog.tsx:60` | Add them. `remove-preview` may rewrite the dialog, so check after it lands |

### Added after the remove-preview review (2026-09-27)

| # | Sev | Bug | Evidence | Fix expected |
| --- | --- | --- | --- | --- |
| B10 | M | The live monitor shows no subtitle overlay while a cue is active (cue 1 0–3 s, playhead 0:01). Likely the same cause as B2 | `monitor-live-voice-music-en.png` from the remove-preview e2e | Fixed with B2. An e2e asserts the overlay canvas has non-transparent pixels while a cue is active |
| B11 | M | The live mix is off for compositions (multi-clip): `useLiveMix` returns early when `composition` is set | `app/ui/features/editor/live-mix/useLiveMix.ts` | Map composition time to clip/source time for the voice and music schedule, the same way the render does, or state the gap in the tool in one clause if a clip's speed makes it impractical |
| B12 | L | The live ducking follows the peak of each sample, while FFmpeg `sidechaincompress` defaults to RMS detection, so the live mix ducks harder than the export | `public/duck-envelope.js` | RMS detection over the same window FFmpeg uses, with the constant shared from `live-mix.ts` |
| B13 | L | Post on a video opened outside the Library runs the save flow, then fails with `POST_REQUIRES_LIBRARY` | `useEditorSession.ts` `postExport` | Disable Post with a one-clause reason when the source has no Library item |
| B14 | L | Voice lines with a rate other than 1 play pitch-shifted live (AudioBufferSource `playbackRate`), while the export's `atempo` keeps the pitch | remove-preview report | Time-stretch while keeping pitch (e.g. `HTMLAudioElement.preservesPitch` per line, or pre-stretched buffers), or keep it as a named deviation if the cost is too high; report which |

## D. Performance found by the real-model run (2026-09-27)

| # | Sev | Bug | Evidence | Direction (owner to choose) |
| --- | --- | --- | --- | --- |
| D1 | H | Object removal runs LaMa on every frame on the CPU at ~4.3 s/frame, so a 30 s, 30 fps short takes about an hour to export | `test:e2e:models` timing (editor-bugs-a report); fixture had to shrink to 3 s 360×640 | Measure first, then combine: skip frames with no detected text or with an unchanged region (reuse the previous inpaint when the masked area is static), run at the 512² crop only, and try the CoreML (macOS) / DirectML (Windows) execution providers. Report the time per frame for each step |

## C. Test drift that hid these bugs

`remove-preview` slice 5 fixes the bell selector, the settings duplicate and the preview
assertions. Also needed: the e2e suite has never run with real runtimes (`.venv` has no
faster-whisper/ctranslate2/onnxruntime), so every model path is only covered by fakes.

| # | Fix expected |
| --- | --- |
| C1 | Add an opt-in `test:e2e:models` run that uses the staged `python/` interpreter and installed models. It covers recognise → apply → translate → export, with object removal. The owner runs it on request, like the other e2e suites |
| C2 | Keep the crawl as `scripts/crawl-editor.mjs` (opt-in, never in CI), so a UI sweep can be repeated after refactors |

## Not covered yet (next sweep)

- Export end to end (full render with every option) and the result, which were not reached by
  this crawl. C1 covers it.
- Voice generation and OCR: no VieNeu or OCR model is installed on this machine, so the crawl
  only saw their "not set up" states.
- Vietnamese UI crawl, composition (multi-clip) flows, project save/open/recovery.

## Sequencing

1. **Worker `editor-bugs-a`** (now, in parallel): A1–A4 and C1. These touch `worker/`, the
   speech/vision status code, locales and a new e2e file. There is no overlap with
   `remove-preview` except the locale files, so each worker adds keys only.
2. **After `remove-preview` merges:** B1–B7 and B9 go to one worker. They all touch the
   monitor and the tool panels that `remove-preview` is rewriting.
3. Re-run the crawl (en + vi) and `test:e2e` after each merge.
