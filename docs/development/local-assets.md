# Related assets — 0.11

Open Sources → Assets for recorded derived files, or select Related assets on a
Library item to focus that content. Filter by project, export, subtitle or audio;
search name/path/content name and use explicit pagination. The original-video
Library remains a separate peer view, not a duplicate asset database.

Use Attach file inside a content context. The host opens a native file dialog,
probes video/audio or validates subtitle/project data, hashes the file, then commits
the association. Projects must declare the owning source hash. Attach never copies,
deletes, processes or publishes bytes. A native selection is not authorization to
modify the file. Local external project opening remains available outside Library.

Saving a project, subtitle or video from a Library-origin Editor records the saved
file after successful publication. A project soundtrack is also linked as audio.
The UI reports saved-but-unlinked when recording any required association fails;
it does not discard the successfully saved file. Finished batch exports are indexed
only after the final output hash matches the existing queue result. Indexing is
awaited before acknowledgment and retried on later queue reconciliation after failure.

Each association records immutable ID, path, SHA-256, byte size and content owner.
Registering different bytes at the same path creates another association; old links
are not rewritten. Check availability, opening a project, previewing or creating a
post from that export validates exact bytes. Missing or changed files fail visibly.
An old link is historical identity, not a backup of the old file's bytes.

Projects open in Editor after verifying the Library video and optional native-selected
soundtrack. Exports/audio preview their exact registered file. Subtitles expose a
read-only cue table; ASS formatting is not edited or visually reproduced in this
Library table. Preview never applies cues to Editor. Subtitle files are bounded to
2 MiB/10,000 cues by the existing worker contract. Codec availability remains a native
player concern; this slice does not transcode on browsing.

Removing a Library listing still soft-removes the record only. It does not remove
originals, linked files, rendered bytes or known post/workflow references. Original
and linked-audio paths remain protected from output overwrites. Asset preview can
work when an original is missing; editing a linked project still needs its original.
There is no asset repair/delete/retention UI or complete analysis/transcript graph.

Current Library database schema is **2**. This greenfield release refuses older or
unsupported stores instead of migrating, clearing or rewriting them. Keep any owner
controlled backup/reset separate from startup. Other stores keep their current schema.
