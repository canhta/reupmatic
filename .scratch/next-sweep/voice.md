# Voice generation — audit findings (2026-09-27)

Source: code audit (subagent). It ran build:core and the synthesis, voice and live-mix core tests
(50/50 pass) plus small node and python probes. It did not run the e2e suites.

## H

- **H1 (CONFIRMED) A cloud or cloned voice track can never be exported.**
  - Evidence: `app/electron/features/speech/synthesis/ipc.ts:222-224` checks the track only against
    local `synthesis.status`. `admission.ts:9-11` then requires the same model_id and a voice_id
    listed in the local presets (`worker/speech/synthesis/models.py:520-545`).
  - Failure: export stops with `SYNTHESIS_MODEL_CHANGED`, `SYNTHESIS_VOICE_MODEL_MISSING` or
    `SYNTHESIS_VOICE_UNAVAILABLE`. A muted track, and a local track after swapping the model, are
    blocked the same way.
  - Fix: admit a finished voice artifact by its hash and receipt. Skip the check when the track is
    muted.
- **H2 (CONFIRMED, core) "Remove narration" makes the project unsaveable.**
  - Evidence: `changeEditor` (`editor-history.ts:24-28`) never deletes a `voice_track` whose value
    is undefined, so `parseVoiceTrack(undefined)` throws `INVALID_VOICE_TRACK`.
  - Same bug as projects H3.
- **H3 (CONFIRMED) Generating with the default "Selected cue" scope replaces the whole track.**
  - Evidence: `SynthesisPanel.tsx:31,153`; `SynthesisReview.tsx:136-143`; `withVoiceTrack` in
    `voice-track.ts:234-262`.
  - Failure: generating line by line keeps only the last line.
  - Fix: merge the new line into the existing track.
- **H4 (CONFIRMED) Narration is silent live after a restart or reopen.**
  - Evidence: `useLiveMix.ts:248-251` calls `synthesisPreview(artifact_id)`, which reaches
    `artifacts.verify`. That checks the in-memory `admitted` map only (`artifacts.ts:43-45`), so it
    throws `UNKNOWN_ARTIFACT`.
  - Failure: the music bed drops too, and the user sees a generic "failed".
  - Fix: pass `{artifact_id, sha256}` and use `artifacts.reopen`.
- **H5 (SUSPECTED) A runtime pack installed from Settings stays "missing" until the app restarts.**
  - Evidence: pack directories go on PYTHONPATH at spawn, before they exist, and `find_spec` caches
    that. No `importlib.invalidate_caches()` runs anywhere.
  - Fix: invalidate the caches before each probe, or restart the worker after an install.

## M

- **M1 (CONFIRMED) Reordering clips then choosing "Keep audio" breaks export.**
  - Evidence: plan lines are no longer in frame order, and `worker/media/audio/voice.py:64` rejects
    a line that starts before the previous one ends. Export fails with `INVALID_VOICE`.
  - Fix: validate that line spans do not overlap, independent of order.
- **M2 (CONFIRMED) A trim can drop every line.**
  - Failure: "Keep audio" then un-stales an empty track. `voice.py:54` rejects it and
    `live-mix.ts:77-82` returns Infinity.
  - Fix: remove the track or refuse "Keep audio".
- **M3 (CONFIRMED) Voice and render codes show a generic "failed".**
  - Evidence: `EditorWorkspace.tsx:31-65,97-107` has no copy for `VOICE_TRACK_STALE`,
    `SYNTHESIS_MODEL_CHANGED`, `SYNTHESIS_VOICE_UNAVAILABLE`, `SYNTHESIS_VOICE_MODEL_MISSING`,
    `SYNTHESIS_ARTIFACT_*`, `INVALID_VOICE` or `UNKNOWN_ARTIFACT`.
  - `MODEL_LANGUAGE_UNAVAILABLE` falls through to the vision copy.
  - Export does not block a stale track up front.
- **M4 (CONFIRMED) Switching tools cancels a running synthesis and discards the draft.**
  - Evidence: `EditorToolPanel.tsx:30-39` unmounts the panel; `useSynthesisJob.ts:125-135`.
  - Fix: lift the job and draft to editor-level state.
- **M5 (CONFIRMED) A cloud retry is charged again, and one failed line discards all paid lines.**
  - Evidence: the idempotency key is seeded on a fresh request_id (`hosted.py:66-69`,
    `useSynthesisJob.ts:158`).
  - Fix: seed the key from content, and keep per-line results.
- **M6 (CONFIRMED in code) Cloud PCM at a sample rate other than 48 kHz is written as 48 kHz**
  (`hosted.py:105-122`).

## L

- L1 Live voice and music follow the clip speed (`useLiveMix.ts:307` versus
  `liveMixClockRate`).
- L2 Copy problems:
  - `MODEL_NETWORK_DISABLED` shows "Blocked a network attempt" for an offline error.
  - The label "Preset voice" also covers cloned and cloud voices.
  - The key `cancelling` is missing in en and vi.
  - A cancelled job shows an error banner.
- L3 `buildSynthesisVoices` ignores `status.available`, so "Set up" is hidden when the pack is
  missing. Nano offers English but only serves vi.
- L4 Synthesis artifacts are never collected. After 256 in one session, `SYNTHESIS_ARTIFACT_LIMIT`
  blocks all synthesis.
  - Undefined policy: `rate_bound = 1`, so over-long lines overlap the next line.

## Checked clean

- The TS↔Python contract.
- IPC wiring.
- Cancel propagation.
- The worker error allow-list.
- voice_track persistence and staleness rules.
- Live versus render line placement.
- Locales for the synthesis error keys.
