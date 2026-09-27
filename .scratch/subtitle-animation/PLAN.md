# Subtitle animation — plan

Owner request (2026-09-27): subtitle animation is weak and has little variety compared with other
tools. Today there is **none**. `worker/subtitles/document.py` writes plain ASS events with no
`\fad`, `\t`, `\move` or `\k` tags, and a cue carries only `start_ms`/`end_ms`/`text`, with no word
timings.

## Why ASS tags

Cues become one ASS document. JASSUB draws it live on the monitor, and libass/FFmpeg burns the same
document at export. Any animation expressed as ASS override tags therefore looks the same live and
in the export, with no second renderer to keep in sync. Every preset below compiles to ASS tags in
one worker module, and the live overlay renders what the worker emits (`subtitles.preview`).

## What other tools offer (reference)

- **CapCut:** per-text In / Out / Loop animations (fade, pop, slide, typewriter, bounce, blur), plus
  caption templates with a highlighted active word.
- **Submagic / Captions / VEED "word" styles:** one line at a time, the active word coloured and
  scaled (the "Hormozi" look), words appearing one by one, and all caps with a thick outline.
- **TikTok native captions:** simple fade and slide-up, with a karaoke-style fill on the current word.

## Scope

### A. Word timings in the cue contract

- A cue gains optional `words: [{ text, start_ms, end_ms }]`, validated in core and in the worker
  (inside the cue, ordered, non-overlapping, text joining back to the cue text). One contract, and
  every producer and consumer is updated.
- **Recognition** keeps the faster-whisper word timings it already computes for splitting
  (`worker/speech/recognition/timestamps.py`) instead of dropping them.
- **Any cue without words** (imported SRT, OCR, translation output, hand-typed or edited text) gets
  word timings **estimated** at render time from character weight. Vietnamese splits on spaces
  (syllables), Chinese per character. Estimated timings are never written back as if measured.
- Editing a cue's text drops its measured words, and the cue falls back to the estimate. Retiming a
  cue scales them.

### B. Animation presets (style field `animation`)

The style gains `animation: { in, out, emphasis }`. Each part is a preset id plus a duration where
it applies. Presets:

| Group | Preset | ASS realisation |
| --- | --- | --- |
| In | none, fade, pop (scale 0→110→100 %), slide up, slide from left, typewriter (per-character reveal), blur-in | `\fad`, `\t(\fscx\fscy)`, `\move`, per-char `\alpha` with `\t`, `\blur` + `\t` |
| Out | none, fade, pop out, slide down | same, at the cue end |
| Emphasis (word level) | none, karaoke fill (`\kf`), active word colour, active word pop (scale on its turn), word-by-word appear, one word at a time | per-word spans with `\k`/`\t`, from measured or estimated word timings |

- **Templates**: a small set of named combinations (for example "Clean fade", "Pop words", "Karaoke",
  "Bold highlight": all caps, thick outline, active word in an accent colour and popped). The user
  picks one, then adjusts. Templates are data in core, not code paths.
- New style fields they need: `accent_color` (active word) and `uppercase`.
- Controls follow AGENTS.md: preset choice → Selector, duration → NumberInput, applied live with
  undo. The Style tool shows a moving thumbnail per template (the same ASS on a sample line) so the
  user sees the motion before choosing.

### C. Correctness

- Animations stay inside the cue's time window. Two consecutive cues never overlap visually (out
  animation vs next in).
- The cover band (remove-inpaint plan) stays static beneath animated text.
- Speed changes and compositions map word timings the way cue timings are already mapped.
- SRT export ignores animation (the existing "SRT won't keep this style" note).

## Sequencing

It starts **after `remove-inpaint` merges**, because both change `app/core/subtitles/style.ts`, the
Style tool and the subtitle contract.

## Verification

Core tests for the word-timing contract and estimator. Python tests asserting the exact ASS tags
per preset. An e2e that the live overlay changes pixels across a pop-in and a karaoke fill (en + vi).
`test:e2e:models` exports with a word-emphasis template from real recognition. Screenshots and a
short screen capture of each template.

Owner confirmed (2026-09-27): all four — word-level highlight, whole-line in/out, templates, and the bold uppercase + thick outline look — ship in the first set.

## A2. Line length from reading speed and style (owner, 2026-09-27)

The owner rejects the hardcoded MAX_CUE_CHARS = 42 / MAX_CUE_MS = 3500 in
`worker/speech/recognition/timestamps.py`. Line length depends on the reader's speed and on the style
size, so it must not be hardcoded.

- **Splitting moves to core** as one pure function over measured word timings: `splitCues(words,
  settings, style, frame)`. Recognition returns segments with their words; the worker no longer
  sizes cues. The same function can **re-split** existing cues that carry words, without
  re-recognising.
- **Auto (the default):**
  - Max characters per line comes from the real layout: frame width minus both side margins, divided
    by the average glyph advance at the style's `font_size_pct` (Latin ≈ 0.5 em, CJK ≈ 1 em, bold
    wider; constants named and documented), times max lines.
  - Max duration comes from reading speed: characters ÷ CPS, bounded by a minimum on-screen time.
- **Custom (optional, in the Editor):** in the Transcribe tool, a collapsed "Line length" section,
  closed by default, holds reading speed (characters per second, NumberInput), max lines (1–2) and
  max characters (NumberInput, or "auto from style"). It lives per project in the snapshot. A
  **Re-split** action applies it to the current transcript layer, with undo.
- **Defaults** are industry reference values, labelled as such in code: 17 CPS for Latin-script
  languages and 9 CPS for Chinese (Netflix timed-text guidance), and a minimum of about 5/6 s on
  screen. They are editable. Report them as the defaults chosen.
- Changing the style size or the frame (crop/fit) does not silently re-split. The Transcribe tool
  shows one clause that the lines were sized for another style, with Re-split beside it.
