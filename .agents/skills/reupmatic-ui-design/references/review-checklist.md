# UI delivery review

Record results as PASS / FAIL / NOT RUN. Static source checks alone cannot pass interaction or visual checks.

## Task and function
- The primary task/action is obvious; no hidden mandatory profile or extra setup screen.
- Existing cue editing, timing, split/merge, undo/redo, timeline, preview and queue actions still work.
- Real empty, loading, error, missing-permission/component, stale and success states exist; no fabricated data.
- A closed panel/navigation change does not cancel jobs or discard unsaved edits.
- Automatic processing does not introduce a mandatory cue/mask review.

## Presentation
- One consistent token set; no random gradients, placeholder charts or giant marketing sections.
- Nested enclosure is selective; data is not buried inside repeated rounded cards.
- Long EN/VI labels and filenames wrap or provide an accessible full value, never cover controls.
- Timecodes/counts align. Selected state, focus and active job are distinct and not color-only.

## Interaction and access
- Keyboard reaches every action with visible focus; disabled actions have an explanation.
- Labels identify inputs and status messages; errors preserve entered data and offer recovery.
- Vietnamese diacritics and IME entry survive editing. Language changes preserve content and jobs.
- Reduced-motion removes decoration; playback/cancel/seek are never delayed.
- Check supported desktop widths and enlarged text; no lost or overlapping controls.

## Evidence and performance
- Inspect actual app screenshots for both locales and populated/empty/error states after setup.
- Test editing while a batch runs; no large scrolling blur, layout animation, frame work in React rendering, or full re-render on each keystroke.
- Check console, lint, typecheck, E2E and source/preview correctness separately.
- Report font fallback, missing dependencies, unexecuted UI checks and target-OS limitations honestly.
