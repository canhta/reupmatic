# Project save / open / recovery — audit findings (2026-09-27)

Source: code audit (subagent) with a node probe against dist-core. The e2e suites and the app were
not run, so anything that depends on Electron IPC or native dialogs is marked SUSPECTED.
`test:core` passes 667/667, but no test covers reopening a project or the recovery hooks, so a green
suite does not clear any finding below.

## High

- **H1 (CONFIRMED) Reopening drops `line_length` and `voice_track`.**
  - Evidence: `app/electron/features/projects/dependencies.ts:82-90` copies every other field but not
    these two. Every open route goes through it: Open, Open Recent, Library and recovery.
  - Effect: the document is not marked dirty, so the next save removes both fields from the file.
    This breaks the promise in `contracts/README.md:227-237` that a saved voice track is
    rediscovered, re-verified and refused by name.
  - Fix: restore both fields, re-verify the voice artifact and refuse by name when it fails.
  - Test: save, reopen, compare the whole snapshot.
- **H2 (CONFIRMED) Autosave writes once per dirty stretch.**
  - Evidence: `app/ui/features/projects/recovery/useAutosave.ts:106-113`. The effect depends on
    `[dirty, opening, media, flush]`, not on `revision`.
  - Effect: after a crash, the draft holds only the state from about 800 ms after the first edit.
  - Fix: re-arm the timer on every revision.
- **H3 (SUSPECTED; the core part is CONFIRMED) Removing the voice track breaks save and autosave.**
  - Evidence: `useEditorSession.ts:1109` calls `change({voice_track: undefined})`.
    `editor-history.ts:23-27` strips undefined keys for other fields, but not for `voice_track` or
    `text_layers`. Structured clone keeps the undefined key, so `parseVoiceTrack(undefined)` throws
    `INVALID_VOICE_TRACK`.
  - Fix: strip those keys too, with a test.
- **H4 (CONFIRMED) An invalid or old project shows a generic or broken message.**
  - `project.ts:80-85` turns every processing error into `INVALID_PROJECT`. Example: a project with
    Arial as its font.
  - The error key `styleInvalid` is missing in both en and vi, so the user sees the raw key.
  - `INVALID_VOICE_TRACK`, `ENOENT` and the `RECOVERY_*` codes have no copy and show
    "Operation failed".
  - Fix: return a specific code (for example `PROJECT_FONT_UNSUPPORTED`) and add copy for every code.
- **H5 (CONFIRMED) Save in the quit dialog does not save the project.**
  - Evidence: `workspace-lifecycle.ts:102,146` and `main.ts:312-319`. The Save button writes only a
    recovery draft.
  - "Don't Save" leaves the earlier draft in place, and the next launch offers it again.
  - Fix: really save the project (Save As when it has no path), or rename the button. Discard the
    draft on "Don't Save".

## Medium

- **M1 Recovery drafts pile up until autosave fails with RECOVERY_LIMIT at 100.**
  - Evidence: `useEditorSession.ts:621,658`, `RecoveryNotification.tsx:22`,
    `project-recovery.ts:92-96`.
  - Fix: discard the source draft once the work is saved, and evict the oldest drafts.
- **M2 Save As can reject the user's own file name.**
  - The save dialog filters on `json` (`ipc.ts:312`), but `saveProject` requires `.reupmatic.json`
    (`project.ts:182`). The error then shows as "Invalid project".
  - Fix: normalise the name, or give this case its own message.
- **M3 A deleted file in Recent shows "Operation failed" and stays in the list.**
  - `recent.ts` never prunes it.
  - Fix: a specific message, a Remove or Locate action, and pruning.
- **M4 (SUSPECTED) OCR options plus cues make the project unsaveable.**
  - Evidence: `parseProcessingRecipe(..., cues>0)`. `EditorProfileSwitcher.tsx:38` can apply an OCR
    profile while cues exist.
- **M5 Reopen policy contradicts the contract.**
  - The soundtrack always asks for a picker without a title (`audio/ipc.ts:29`).
  - Open Recent trusts `source.path`, but `contracts/README.md:81` says the stored path is only a
    hint.
  - Fix: decide one policy and document it.
- **M6 A recovered draft forgets its project path.** The next Save becomes Save As.
- **M7 The renderer can supply any `.reupmatic.json` path to save-project (`ipc.ts:316-325`).**
  - Fix: the main process authorises project paths.

## Low

- L1 `saveCurrentProject` saves the snapshot from the last render with the current revision
  (`useEditorSession.ts:786-792`).
- L2 Undoing back to the saved state still shows the document as dirty.
- L3 `parseProject` returns an unnormalised clone (`project.ts:136`).
- L4 `RecentStore.record` does a non-atomic read-modify-write, and a corrupt file reads as empty.
- L5 A saved project inherits permission 0600, and a crash leaves an orphaned `.tmp` file.
- L6 Docs drift: `contracts/README.md:79,83,195`, and the schema's `required` list omits `name`.

## Checked clean

- Round trip: cues (words and links), text layers, processing, media, composition, soundtrack and
  name all survive.
- A source whose hash changed fails with `SOURCE_CHANGED`.
- Loading is strict: unknown keys and truncated files are rejected.
- Save is atomic.
- The recovery store's transactions are sound.
- Unsaved-changes prompts appear on every route.
- Dirty state clears correctly after a save.
- Save and Save As behave correctly.
