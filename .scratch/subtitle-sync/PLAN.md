# Subtitle sync with the original — plan

Owner (2026-09-27): **the most important thing is timing sync with the original subtitles.** After
translation, the new subtitles have different sync and different lengths.

Reupmatic re-uploads Douyin videos. They usually carry burned-in Chinese subtitles that the creator
already synced to the speech. The new (Vietnamese) subtitles must appear and disappear **exactly
when the originals do**, so they read as native and the cover band hides the old text at the right
moments.

## Findings (code, 2026-09-27)

1. **OCR timing is quantised to the sample interval.** `worker/processing/ocr_scan.py` samples every
   `sample_ms` (default 500 ms) and cue boundaries fall on sample times, so a cue can start or end up
   to ~500 ms off the original.
2. **One original subtitle can split into several cues.** Consecutive samples merge only when the
   OCR text is **exactly** equal (`ocr_scan.py:41`). One misread character breaks a subtitle into
   fragments, which then translate separately and flicker.
3. **Translation keeps the source window 1:1** (`worker/speech/translation/runner.py`:
   `{**cue, "text": text}`), which is correct. But nothing handles a Vietnamese line that is much
   longer than its Chinese source in the same window (Chinese is dense: 10 characters often become
   25–35).
4. **QC reading-speed thresholds are constants** (`app/core/subtitles/qc.ts`
   `defaultQcThresholds`), not the reader settings from the animation plan's A2.

## Principle

**The original's timing is the source of truth.** A translated or edited line keeps its source cue's
window. Length is absorbed by layout, and flagged when it cannot be. Timing never drifts to fit text.

## Slices

### S1. Frame-accurate OCR boundaries (worker)

After sampling, refine every cue start and end to the exact frame. Between the two samples that
straddle a change, bisect on decoded frames, comparing the subtitle region (the detected text boxes'
union, padded) by a normalised pixel difference, with OCR only as a tie-break. Target: boundaries
within one frame of the true change. Report the time cost per minute of video.

### S2. Robust merging of one original subtitle (worker)

Merge consecutive samples into one cue when their normalised text (NFC, whitespace and punctuation
stripped) is within a small edit-distance ratio **and** the text boxes overlap. Take the cue text by
vote across its samples, weighted by confidence. A real change of line (low similarity, or a gap
with no text) always splits. Name the thresholds and cover them with fixtures of noisy OCR runs.

### S3. The translation stays linked to its source (core + worker)

- Every translated cue records `source_cue_id`. Translation output keeps the exact source
  `start_ms`/`end_ms` (make it an asserted invariant, in core and the worker).
- Re-splitting (animation plan A2) applies to recognition/transcript layers only, never to a
  translated layer. If the source layer changes (re-split, retime, edit), the linked translated cues
  are marked stale in the review UI; they are not silently retimed.
- Hand retiming a translated cue is allowed, and it shows as a deliberate deviation from the source.

### S4. Fit long translations into the fixed window (subtitle layout; owned by the animation worker)

Handled inside the existing cue window, in this order: wrap to the max lines → shrink that cue's font
down to a floor (e.g. 80 % of the style size; named constant) → flag. Flags use the QC thresholds
driven by the A2 reading settings (CPS), not constants. The review list shows each over-speed line,
with its source text beside it, so the user can shorten the wording. The window is never extended.

### S5. See and verify sync (UI + tests)

- The timeline shows the source cues (OCR or transcript) as a thin lane above the translated
  subtitles, so drift is visible at a glance.
- A fixture video with burned-in text at known frame times (FFmpeg `drawtext` with `enable=between`)
  asserts: OCR boundaries within one frame, one cue per original line despite injected OCR noise, and
  translated windows identical to the source windows.
- `test:e2e:models`: real OCR → translate → export, checking the rendered subtitle timings against the
  fixture's times.

## Sequencing

- **S1, S2 and S5's fixture** touch `worker/vision`/`worker/processing`. They start **after
  `remove-inpaint` merges**, which is rewriting those files.
- **S3** (core contract link) starts after the animation worker's slice A lands, because both change
  the cue contract.
- **S4** goes to the `subtitle-animation` worker with its layout/ASS work.

## Open after S3 (merged b562a87, 2026-09-27)

- A composition split copies one `source_cue_id` onto every piece, so the extra pieces can read as
  deviated. They are never retimed silently; the split rule still needs deciding.
- A layer copied into "translated" (copy provenance, not translation) has no `source_cue_id`, and
  sync falls back to matching ids. Replace that with explicit provenance, or show "no source link",
  instead of a heuristic.
- Drift shows on the applied translated layer, not in the draft review; that is correct, since a
  draft cannot drift.

### S6. Place the cover band over the original subtitles automatically (added 2026-09-27)

The cover band (remove-inpaint) defaults to a bottom strip. On real Douyin videos the burned-in
subtitle often sits higher, so the default does not cover it and the user has to drag it into place.
Once OCR has run (S1/S2 already compute each original cue's text boxes), offer **Fit to original
subtitles**: set the band to the union of the detected boxes across the video, padded by a named
margin, in output-frame coordinates. If boxes jump between two distinct positions, report the
positions and cover the dominant one rather than one huge band. The user can still adjust by hand.

## Found after S1/S2/S5/S6 (merged 7a4e207, 2026-09-27)

- **F1 (H) The shipped FFmpeg renders Chinese as tofu.** The staged static FFmpeg (`ffmpeg/ffmpeg`,
  the one packaging ships) burns "Xin chào 你好" with the Chinese as empty boxes. libass falls back
  to macOS PingFang (a private framework font it cannot open) and fails. Vietnamese with Arial is
  fine. Every render test so far used Homebrew `ffmpeg-full` via `.env.local`, so this was never seen.
- **F2 (M) Live and export fonts differ.** JASSUB draws with its own bundled default font, while the
  export's libass resolves system fonts. The monitor can show a different typeface, width and wrap
  from the video, which also breaks line-length sizing.
- **Direction (owner decision: bundle size):** ship one app-owned font set (OFL), for example Noto
  Sans / Be Vietnam Pro for Latin + Vietnamese and Noto Sans SC for Chinese, subset to the needed
  weights. Pass the same files to libass (`fontsdir`) and to JASSUB, so live and export are
  identical on every machine, Windows included. Font choices in Style are limited to that set. Size:
  a CJK face is ~8–16 MB per weight before subsetting.
- Test hygiene: the native sync fixture needs an FFmpeg with drawtext and a working fontconfig. It
  passes with `ffmpeg-full` (`.env.local`) and not with the static build. Document it in
  CONTRIBUTING.md, and add a render test that uses the **staged** FFmpeg.
- The real-model OCR e2e skips: no OCR model is installed on this machine.
