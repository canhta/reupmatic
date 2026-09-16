# Owner checks — current 0.9 source release

This is a manual checklist, not a passed E2E report. Set up the actual pinned
runtime and dependencies first; follow `README.md`. Use a new development
workspace. Never erase incompatible project/store data automatically. Back up
any data before an explicit owner-controlled reset.

## Application and component behavior

Build and launch the installed Electron application; inspect source errors before
running native tasks. Review every primary area in both EN and VI and at narrow
and wide window sizes. Verify Astryx foundation CSS, keyboard/focus, screen-reader
names, Vietnamese IME, form errors, disabled states and unsaved-change dialogs.
The targeted missing-dependency diagnostic in RESULTS is not a UI approval.

## Shared local catalog

Create categories/tags, rename one, assign it to a Library item, channel and link,
and restart. Identities must remain stable. Archive a label and inspect retained
assignments and the picker. Make a stale edit from another view and verify the
newer record is not silently overwritten.

Create/edit/archive a local channel and a manually entered affiliate link. Review
search, selection, validation and empty/error states. The destination must remain
unconnected without invented publish permission. Discard a channel edit and
cancel that discard; confirm the draft behaves consistently.

## Export-backed posts and plans

Use a small owned local video. Render through the shared queue and confirm the
export appears in Library. Select that concrete export to create one draft for
one destination with chosen links. Change the original link/channel afterward;
review the draft's pinned snapshot and reverse usage. Edit/cancel the draft and
check that shared views show the same state. No network upload should start.

Choose a planned date and timezone. Test a nonexistent DST hour, a repeated hour
with both possible offsets, and an unchanged existing precise time. A saved plan
is metadata, not evidence that a scheduler will execute it.

## Profiles and saved workflows

Create/export/import a processing profile. Applying it in Editor, batch or a
workflow must be explicit and must not start inference. Manual per-video masks
must be rejected as reusable profiles. Unsupported profile/project formats must
fail without changing the input file or silently migrating it.

Save a workflow with Library inputs and an output directory. Restart and inspect
it. Developer execution requires `npm run start:automation`; preparation/running
must snapshot inputs, recipe and models and use the same queue. Start the queue
explicitly, inspect run history and verify retry/recovery does not duplicate
admission. A disabled developer gate is not a Plus entitlement implementation.

## Existing media behavior and persistence

Recheck cue editing/undo, project save/open, sample/full render, safe export and
Library source relinking. Run actual licensed local model weights separately;
controlled-adapter tests do not certify quality. Verify processing cancellation,
cache identity, source protection and incompatible-model errors. Existing quality
and resolution limits remain documented in `local-processing.md`.

A non-current or incomplete SQLite schema must produce an actionable error before
mutation. Fresh stores initialize normally; there is no repair/migration fallback.
For the CLI, use a new isolated workspace and verify an existing workspace is
refused. Do not point the CLI at a live desktop workspace.

## Handoff checks

Use `npm run structure:check`, `npm run scope:check` and the test scripts. Confirm
all 96 reserved `.gitkeep` markers and the single root `AGENTS.md` survived source
control/extraction. Consult the scope traceability before planning the next slice;
placeholders are not implementation. The next archive after 0.9 is 0.10.
