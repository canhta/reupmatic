# Compositions (multi-clip): audit findings (2026-09-27)

Source: code audit by a subagent, with two findings reproduced against dist-core. The composition
and render-coordinator core tests pass (43/43), so none of these bugs has a failing test yet.

## H

- **H1 (CONFIRMED) Dropping a clip onto the timeline misaligns every layer except the displayed one.**
  - Where: `placeMedia` (`useEditorSession.ts:500-506`) calls `compositionSnapshot`, which remaps
    only `snapshot.cues`.
  - Result: the translated layer, transcript, spoken layer and voice track keep their old times.
    Nothing is marked stale.
  - Fix: route the insert through `editCompositionSnapshot`.
  - Test: insert at index 0 with text layers and a voice track present.
- **H2 (CONFIRMED) A trim or speed set before the composition existed still applies to the export.**
  - Where: `ClipsPanel.tsx:22` hides the controls; `snapshot.ts:133-138`;
    `render-coordinator.ts:109`.
  - Result: the export is cut to the old trim, and the user has no way to see or clear it.
  - Fix: show the edit window in composition mode, or remap or clear it when the composition is
    created.
- **H3 (CONFIRMED) Monitor playback stops at every clip boundary and cannot resume.**
  - Where: `useSourcePreview.ts:125-129` pins playback to `end-1` and never moves to the next clip.
  - Fix: at the boundary, seek to the next span and keep playing.
- **H4: same as projects H1.** Reopening a project drops `voice_track` and `line_length`.

## M

- **M1** In a composition, the live mix plays music and voice at the clip's speed.
  - Where: `useLiveMix.ts:307` sets `graph.rate` from `playbackRate`.
  - Fix: use `liveMixClockRate`. Same bug as voice L1.
- **M2** The monitor plays disabled clips, while the export renders them as black and silence.
  - Where: `useSourcePreview.ts:49-51` does not use `compositionPosition`.
- **M3** A composition gets no live subtitle overlay: the ASS request is skipped
  (`useEditorSession.ts:412`, `useMediaAdapters.ts:21`).
  - Fix: pass `canvas: composition.canvas` and the enabled cues.
- **M4** When trim start > 0 or speed ≠ 1, voice lines shift in the export, for single videos too.
  - Where: offsets are in source time, but `adelay` runs on the output clock (`mixing.py:84,106`).
  - Fix: map each offset to `(offset − trim.start)/speed`.
  - The same question applies to the music offset. Which clock that lane uses is an undefined
    policy.
- **M5** OCR runs on a composition, then "Apply" silently does nothing (`applyOcr` returns false).
  - Fix: block the scan in composition mode with an en+vi banner.
- **M6** Export is disabled with no stated reason when the processing recipe has OCR
  (`renderUnavailable` is unread), and that also blocks subtitle-only export.
- **M7** Any unrelated edit disables the Composition panel's actions.
  - Where: `CompositionPanel.tsx:27,33,101` compare against a revision captured at select time.

## L

- L1 The cue-limit error code is compared against a copy key, not the code, so its message never
  shows (`CompositionPanel.tsx:263`).
- L2 After Apply, the selection jumps back to clip 1.
- L3 The original lane's waveform draws the primary source stretched across the whole composition.
- L4 Copy:
  - `compositionStale` says "Reload", but the button is labelled "Revert".
  - `compositionSummary` has no plural forms.
- L5 (policy) Voice and music keep playing over disabled clips. The sidecar export ignores
  `clipCuesToEnabled`.
- L6 (SUSPECTED) Open Recent asks for a picker for every non-primary clip.

## Checked clean

- Parsing, and rounding parity between TS and Python.
- Cue remapping: speed, move, split and join.
- Split-piece linking.
- Voice remapping on reorder and speed changes.
- Registration and source verification.
- Montage assembly.
- Render time offsets.
- Cancel and failure paths.
- Save and load of composition fields.
- Speech recognition is blocked in composition mode.
