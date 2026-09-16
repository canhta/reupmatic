# Local workspace foundations — 0.9.0

This release implements bounded local workflows. Saved channel URLs do not grant
publishing access, and local plans are not platform schedules. Original media,
project documents and generated exports remain separate identities.

## Sources and shared labels

Import videos in Sources → Library using the existing reference/copy decision.
Create or edit category/tag labels in Sources → Labels or the contextual label
picker. Select a Library item and assign existing labels to it. The same stable
label IDs are used on channels and Shopee links; translating the interface or
renaming a label does not create a new identity. Duplicate normalized names and
stale edits are rejected. Archiving affects new choices, not historical references.

Library details now include related post/workflow counts. A referenced item cannot
be removed from the catalog while those references exist. Removing a listing is
still separate from deleting originals, projects, generated files or caches.
There is no new destructive cleanup or implicit taxonomy merge policy.

## Channels and Shopee links

Channels & Affiliate has Channels, Shopee links and Posts & plans views. Add a
local destination with a name, YouTube/Facebook Page type, optional supported URL,
shared labels and archive state. The app deliberately records `not_connected` and
`can_publish: false`. No OAuth token, browser session or platform account is faked.

Enter Shopee URLs manually, name and label them, and inspect their linked posts.
URLs are validated, not crawled or converted. Counts and reverse post lists use
the same saved-post scope, including cancelled drafts. They are not click, revenue,
commission, sales or published-post metrics. Saved selections do not change when
an affiliate URL or channel display name is edited later.

## Export-backed post drafts

Render from a Library-origin video so the existing host records a concrete export
link. In Posts & plans, choose a destination and verified Library export, optional
Shopee links, title/body and optional intended time. The host resolves native-owned
paths and hashes the output; renderer code cannot substitute an arbitrary path.

A post stores a snapshot of the destination, export hash and selected link URLs.
Edits change title/body/plan/state, not the chosen export/destination/links. Create
a new draft to choose different targets. Save uses an expected record revision;
a stale window cannot silently overwrite a newer edit. Drafts can be cancelled.
The Open export action rechecks the file hash instead of trusting an old path.

The All, Upcoming, Cancelled and Published filters share one post store. Published
is truthfully empty because no publisher exists. Upcoming displays local planned
drafts, including overdue ones; nothing starts when its clock time is reached.

## Intended times, not a scheduler

DateTimeInput edits a calendar wall time. The explicit IANA timezone resolves it
to a stored epoch instant. A nonexistent daylight-saving hour is rejected. A
repeated hour requires an explicit occurrence choice. Locale changes never change
the timezone or instant. Unchanged edits retain stored millisecond precision.
These checks do not constitute a production trigger, upload or reconciliation.

## Reusable processing profiles

Editor → Profiles manages named, optional processing recipes with notes and an
archive flag. Import reads a current-format JSON document (the export dialog defaults to `processing-profile.json`)
into an unsaved draft; it does not execute or automatically save it. Export uses
a native save dialog and protected atomic replacement.

ProfilePicker explicitly applies the selected recipe to Editor, the batch draft,
or a workflow draft. The receiving draft owns a copy; later profile edits do not
rewrite jobs or saved runs. Automatic OCR conflicts with an existing subtitle
track. Per-video manual mask rectangles are rejected as reusable profile data.
Keep them on a concrete project/job instead. Full transform/speech/style profiles
remain dependent on those not-yet-implemented capabilities.

## Saved workflows and run history

Automation → Workflows saves a name, selected Library IDs, native-chosen output
directory and optional processing recipe. Profiles are optional conveniences, not
required workflow dependencies. Saving/archiving does not render or start a watcher.

For the current execution slice, launch with `npm run start:automation`. Explicit
submission verifies all selected Library content and output location, resolves
required model fingerprints, then persists a concrete run snapshot. Queue
admission uses that run ID. A crash between the queue commit and catalog receipt
can retry admission with the same ID without duplicating jobs. Changing a workflow
or profile never changes inputs already captured by a prepared run.

If the shared queue is paused, submission leaves jobs waiting until Start queue.
If it is already running, explicitly admitted jobs may start. Run history derives
queued/running/partial/failed/interrupted/completed state from the same batch jobs;
missing jobs and mixed results are not shown as a completed workflow. Recovery
reuses captured choices rather than the latest mutable form.

This is not flexible step orchestration, scheduler/trigger support, routing,
download-only/OCR-only/classification-only execution or production Plus policy.
Those independent endpoints remain explicit in the scope map, not forced through
this temporary render-capable workflow subset.

## Storage and greenfield contracts

`catalog.sqlite` stores labels/assignments, channels, links, profiles, posts,
workflows and run admission records under one revisioned transaction boundary.
The existing Library, batch and folder stores remain their business owners.
A cross-store run/queue boundary is recovered by idempotent admission, not a
fictional all-databases transaction. Each catalog kind is currently bounded to
2,000 records for the integration workload; this is not a Free/Plus entitlement.

One current schema is supported per document/store. Fresh databases initialize
atomically. Unsupported, unversioned nonempty or incomplete stores fail without
automatic migration, repair, downgrade or reset. All project saves use current
v3, with processing and composition optional; earlier project formats are rejected. Keep user media and old
archives safe. There is no promise to open earlier development datasets.

## Evidence boundary

Core/native tests exercise revisions, snapshots, reference protection, workflow
admission and a real FFmpeg workflow → queue → Library export → post-draft path.
The new screens have source checks and EN/VI strings, not an installed Electron
interaction or screenshot pass. Real-model quality, OAuth/publishing and Windows/
macOS installers are not certified. See `research/integration-0.9/RESULTS.md`.
