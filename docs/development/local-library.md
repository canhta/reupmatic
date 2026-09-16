# Local Library — current source behavior

The local-file Library now includes contextual labels and the related Assets view.
It is not online Downloads, retention/cleanup, channel publishing or an account service.
The product specifications retain their wider scope. Read the current RESULTS
report before treating source-level UI wiring as a runnable Electron acceptance.

## Import and source identity

Sources contains Library, Assets, Labels and Downloads peer views. Library imports authorized
local video files through a native picker, up to 100 files per request. Import
options remain visible: **reference existing files** or **copy into the app
library**, and **reuse existing content** or **create a separate item**. The current
initial choices are reference/reuse; nothing is imported until explicit selection.

Reference stores the verified local path without moving bytes. Copy creates one
owned directory under `integration-workspace/library-originals/`, verifies source
and copied SHA-256, then commits the catalogue item. A failed copy removes only
that newly owned incomplete directory. Existing files/copies are not overwritten.
Copy mode consumes additional disk space and does not establish a cleanup policy.
The displayed source name is retained rather than becoming `source.mp4`.

Duplicates are determined from content SHA-256, not filename/mtime. Reuse returns
an existing active record; separate creates a distinct record and preserves its
own associations. A missing or changed reference must be relinked to the same
bytes, not silently redirected to different content. Open and relink probe and
hash again; the displayed state says when verification last occurred. On restart,
availability resets to unchecked rather than showing stale green health.

Import proceeds one file at a time and records each completed result. Cancellation
stops before the next file; the active file finishes safely. A failure for one item
does not roll back already committed items. The UI shows counts and per-file errors,
not a fabricated full-file transfer percentage. Normal Editor operation remains
available when Library initialization fails.

## Using and linking a record

Open a record in Editor, then explicitly save a project, SRT or rendered video to
record an association. File saving must succeed before linking. A linking failure
does not discard the saved file; Editor reports saved-but-unlinked status. The
catalogue indexes only saves performed through a Library-origin source, not every
file elsewhere on disk or historical project/publishing references.

Details can reopen an existing linked project after strict project validation and
same-source hash/duration checks. The trusted source is the currently resolved
Library record, not an arbitrary path embedded in a project file. Opening an
unassociated external project still asks the user to select its source natively.
If Editor edits change while a source or subtitle import is loading, the late
result is rejected and newer edits are kept.

Selected Library items stage the existing Batch & jobs draft; this is not enqueue
or start. Selection is limited to the current page, cleared when that page/search
changes, and the current draft may not exceed 100 items. Choose an output folder,
optionally attach each item's SRT, then enqueue and start explicitly. The exact
Library record ID and source identity persist with the batch input; intentional
duplicates are not conflated by their shared hash. Completed export associations
are reconciled from the existing journal, including after restart.

A relocated source does not rewrite already saved batch input. Such jobs retain
their original path/hash and fail source validation when appropriate; prepare a
new draft from the relinked Library record rather than silently changing a queued
job's accepted input. The new Settings default folder likewise affects only future
native folder choices, never existing job destinations.

## Removal, storage and recovery

**Remove library listing** is a soft removal only. Confirmation reports known
associated-file and pending-job counts. It deletes no original, managed copy,
project, SRT, video export or queue record. Removed originals remain protected from
output overwrites; this operation is not cache cleanup, storage reclamation or a
retention policy. External dependencies are not exhaustively indexed.

Library persistence is `integration-workspace/library.sqlite` under Electron user
data. Keep SQLite WAL/SHM sidecars with a live database; close the app before making
a manual coherent backup of the workspace. Do not place the journal on a network
share, open it in two app instances or delete it to hide a failure. A future schema
version is rejected instead of reset. The 10,000-record bound includes soft-removed
records and is a local safety limit, not a Free/Plus paywall. No vacuum/prune UI is
provided in this slice.

Settings uses `preferences.json` with schema version and revision, and separate
`local-models.json` for validated model paths. Invalid/future preferences remain
untouched and produce a visible unavailable state; explicit source saving still
works. Atomic preference changes are serialized and update memory after commit.
The host stops intake and drains accepted IPC before closing Library persistence.

## Verification and remaining UI gates

Core tests cover persistence, strict source identity, reference/copy policies,
duplicate records, relinking, failure rollback, escaped search, links, soft removal,
preference ordering and safe exports. A native TypeScript/SQLite/Python/FFmpeg test
covers Library → relink → saved project → batch output with original audio.

Native pickers, Astryx installed API compatibility, keyboard/IME, screenshots,
search focus and Library/Settings Electron interaction still need real application
verification. Existing Editor/batch/folder E2E scenarios are not evidence of tested
Library/Settings UI. See `research/integration-0.11/RESULTS.md` and `local-assets.md` for current changes.
