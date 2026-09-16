# Local Editor recovery — 0.10

Scope: SC-02/03 and FLOW-21. Recovery is local project data, not cloud sync or an
alternative render queue. Core owns the current SQLite store; the project feature
owns Electron IPC; the Editor recovery feature owns status and user decisions.

After a valid edit is idle for 800 ms, the app saves a whole Editor snapshot into
`editor-recovery.sqlite` in its workspace. Each opened editing document has a new
identity, even for the same video. Writes are serialized and compare the expected
store revision. A stale write/delete cannot silently replace a newer draft. The
source fingerprint is immutable within one draft; source media is never copied,
overwritten or deleted by autosave.

The store retains at most 100 drafts, up to 2 MiB per project. There is no automatic
eviction, migration, repair or deletion on schema errors. Errors preserve the last
successfully saved version, surface a retry action and do not claim the latest
edit is safe. The last 800 ms and unacknowledged in-flight writes can be lost in an
abrupt crash; only acknowledged saves are recoverable.

On changing source/project, save the current dirty draft before replacing the
Editor and recheck the captured revision after the file dialog. Closing requests
an immediate renderer flush before IPC admission closes. Failure or a renderer
that does not answer within eight seconds prompts an explicit choice: remain or
quit without the latest changes. The latter retains any earlier saved draft; it
does not pretend the newest snapshot was persisted.

The recovery panel lists saved drafts and their source/time/identity. Opening one
requires explicit selection of a source with matching SHA-256, then opens a **new
editable copy**. The original recovery entry remains available until explicitly
discarded. Corrupt entries remain listed rather than preventing other recovery.
Discard requires confirmation and its exact revision; it removes only the draft
record, not source media, project files, exports or other drafts.

Saving an explicit project clears its matching recovery entry only after the
file save succeeds and the Editor revision still matches. A newer edit survives
the file dialog. Storage/cleanup failure does not undo the saved project file.

Store persistence/CAS/source protections are tested. Installed Electron close,
crash, IME and accessibility flows are not yet verified. Complete multi-asset
recovery/relocation remains unimplemented; this slice restores one source and its
current editing/subtitle/processing snapshot.
