# Remove sample/preview rendering — refactor plan

Owner decision (2026-09-26): drop the preview feature. Real videos are short, so the user renders
the whole video instead of rendering and watching a sample range first.

## What "preview" is here, and what stays

**Removed — rendering a sample range to check the result:**

| Surface | Where |
| --- | --- |
| Sample range (Start/End s) on the monitor | `MediaStage.tsx` (`sampleStart`/`sampleEnd` fields), `useEditorSession.ts:163,244,693,941` |
| **Sample** button and the Source / Preview switch on the monitor | `MediaStage.tsx:30,71,115-145,174-189,333-352,356-392` (`MonitorMode`, `previewVideo`, `previewClock`, `previewStale`, `noPreview`) |
| Render mode `sample` | `useRenderJob.ts:68-111` (`mode`, `start_ms`/`end_ms`, `preview`/`setPreview`), `useEditorSession.ts:190,249,526,669,934` |
| Host render window | `render-coordinator.ts:30,86-110,297` (`mode`, `start_ms`, `end_ms`) |
| Worker sample window | `worker/media/render.py:23-29`, `worker/processing/service.py:36-137` (`mode`, `output_sample`, `apply_fades=… or output_sample`), `worker/media/render_source.py`, `worker/processing/chunks.py` |
| Voice track **Audition** | `VoiceTrackPanel.tsx:96-100`, `voiceTrackAudition*` copy |
| "Render a sample to hear the result" | `soundtrackHelp` copy in `audio-tools` |
| Recognition range sample/full | `SpeechGenerator.tsx:33,65-76`, `useSpeechJob.ts:132-150` (`scope`), `speechSample`/`speechScope` copy |
| OCR range sample/full | `OcrExtractGenerator.tsx:37,61-65,158` (`media.ocr` on the sample vs `media.ocr.extract`), `useVisionJob.ts:104-117` (10 s / 120 s sample caps) |
| Project field `sample` | `app/core/projects/project.ts:25,60,85-107`, `contracts/project*.schema.json` |
| Contracts and examples | `contracts/worker-request*.schema.json` (render `mode`/window), `contracts/examples/render-sample.json`, `contracts/README.md`, `scripts/sync-contracts.py` |
| Copy | `sample`, `sampleStart`, `sampleEnd`, `noPreview`, `monitorPreview`, `speechSample`, `visionDecoding`/`visionEncoding` "sample" wording, `settingsModelsSaved` ("Run a sample…"), in **en and vi** |

**Kept — not rendered previews; each shows the result instantly on the source video:**

- Colour, crop/geometry, logo and fade overlays on the source monitor (`core/editing/*-preview.ts`).
- The live subtitle overlay (`subtitles.preview` → ASS text → JASSUB).
- Voice preview in Settings → Voices (a short cloud/cloned-voice clip, not a video render).
- `sample_ms` (the OCR frame interval) and `sample_rate`: different meanings of "sample".

## Target behaviour

- The monitor has one player, the source video, with its live overlays. There is no mode switch.
- Recognition and OCR always run on the whole video (or the whole composition).
- Voice, music, ducking and object removal are verified by exporting the whole video.
- `render` has a single mode. Its request carries no `mode`, `start_ms` or `end_ms`.
- A project file has no `sample`. A project saved with `sample` is an unsupported format and fails
  loudly (greenfield rule, no migration). Local dev projects and drafts need an owner-driven reset.

## Owner decision: review like a video studio (2026-09-26)

Studios (CapCut, Premiere, DaVinci) never make the user render a sample. The program monitor plays
the timeline with every track live, and export ends on a result view. So:

- **Live program monitor.** While the source video plays, the monitor mixes the voice track, the
  music and ducking live (Web Audio: one `AudioContext`, the video element, voice WAV and
  soundtrack as sources, gain nodes carrying the same volumes, fades and ducking envelope the
  worker applies), kept in sync on play, pause, seek and rate. Track mute/solo come from the
  existing lanes. Object removal (inpaint) stays export-only: it is too heavy to run live, and the
  clean-up tool says so in one clause.
- **Result view after export.** When a full export finishes, the monitor switches to that file
  with **Open**, **Show in folder** and **Post** (opens Channels with this export preselected).
  Any edit returns the monitor to the live view; the result stays reachable from the export
  notice until the next export.

## Slices (each test-first, one commit each)

1. **Contract + core:** drop render `mode`/window and project `sample` from the schemas,
   `render-coordinator.ts` and `project.ts`. Delete `render-sample.json`. Update core tests
   (`render-coordinator`, `processing`, `core`, `workflows`) and remove sample-only cases rather
   than adapting them.
2. **Worker:** remove the sample window from `render.py`, `processing/service.py`,
   `render_source.py` and `chunks.py`. Fades always apply. Update the Python contract and native
   tests (`test_processing*`, `test_editing_native`, `test_composition_*`, `test_soundtrack_native`,
   `test_media_contracts`, `test_contracts`).
3. **Editor session + monitor:** remove the sample state, `MonitorMode`, the Sample button and the
   range fields.
3b. **Live audio mix** in the program monitor (voice, music, ducking, fades, volumes, in sync on
   seek/rate). Put the envelope maths in `app/core` so the preview and the worker's filter chain
   share one definition, and test it against the worker's values.
3c. **Result view** after export: play the exported file, Open, Show in folder, Post →
   Channels with the export preselected (also fixes the Post editor not reloading exports:
   `PostEditor.tsx` effect with `[]` deps ignores library changes).
4. **Tools:** recognition and OCR go full only (drop `scope`, the `media.ocr` sample path and the
   sample caps). Remove Audition. Fix the soundtrack help copy. Delete dead copy keys in en and vi
   together.
5. **E2E suites** (the owner approved running e2e for this refactor): delete sample assertions
   and fix the stale selectors below. Run `test:e2e` once at the end.

## E2E failures found on main (2026-09-26, 91/102 pass)

| Test | Cause | Handled by |
| --- | --- | --- |
| Audio panel ducks the soundtrack (en, vi) | waits for "Hear it with Sample." | slice 4/5 (removed) |
| populated Editor keeps preview, cues, timeline… | asserts the sample range is hidden in Source mode | slice 3/5 (removed) |
| Editor failure raises a toast… (en, vi); recovered draft | the test looks up `.workspace-status-notifications`, removed in `c986236` (Astryx badge refactor) | slice 5: select the bell by role/name |
| Settings: category navigation… | "Object removal" appears twice (`settingsModelObjectRemoval` + `settingsOfferedInpainting`) | slice 5: decide whether it is a duplicate in the UI or the test needs to be scoped; fix the UI if both show in one view |
| Recognise speech: one configured engine names itself (en, vi); generator panels screenshots (en, vi) | the single-engine label and the start button never become visible | slice 4: diagnose while rewriting `SpeechGenerator` (engine list/model status in the seeded workspace) — treat as a product bug until shown otherwise |

## Verification

`check`, `typecheck`, `test:core`, `test:bridge`, `test:python`, then `test:e2e` once
(owner-approved for this refactor). A UI pass with screenshots of the monitor, the Transcribe and
Voice tools, and the export dialog in en and vi.
