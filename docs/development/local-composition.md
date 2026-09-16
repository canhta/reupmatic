# Local clip composition — 0.12

Scope: SC-02/03/05, FLOW-01/03/15/21/22. This is a bounded implementation of
hard-cut assembly, not approval of every open ED-Q01 product choice. One existing
Editor document becomes one output. Importing a Library batch still creates
separate jobs; it never silently joins those videos.

## Working with clips

Open a local or Library video, then expand **Clip composition** and choose
**Start composition from this video**. That action is undoable. **Append video
files** uses a native picker; selected files are checked before a single atomic
append. Up to 64 clips use independent source in/out ranges and 0.25–4× speed.
Each retained clip must produce at least 100 ms; total composition is at most
24 hours. Ranges use integer milliseconds, not a promise of arbitrary-frame cuts.

The clip table and read-only video row in the existing specialist timeline show
order and composition spans. Select a clip, stage its source range/speed, then
**Apply clip range / speed**. Unapplied drafts do not affect rendering or autosave.
A changed document blocks a stale draft until **Reload applied clip**. Selecting
another table row asks before discarding a modified draft. **Move earlier/later**,
**Split selected clip at playhead**, **Join with next cut** and confirmed removal
are explicit commands. Join only combines contiguous source ranges from the same
path and bytes at the same speed; it is not a crossfade. Keep at least one clip.
Use whole-document Undo to leave composition mode or reverse an operation.

Each command remaps existing captions through old clip/source coordinates to
retained footage. Reordering moves its captions; splitting may fragment a caption;
removing/shortening footage removes corresponding fragments. Text and appearance
are retained for surviving fragments. Appending another copy of a source does not
duplicate existing captions. Join does not automatically merge caption fragments.
An edit that would exceed the 10,000-caption budget is rejected atomically; it
does not silently truncate captions or partially apply clips.
Undo restores original captions, composition, processing and sample bounds.
Shortening clamps sample/global trim bounds to the new duration; a final tiny
sample may need widening before it contains a renderable 30 fps frame.

## Clocks and previews

Clip in/out uses each file's source clock. Timeline, cues, global trim and sample
range use the gapless composition clock. Global speed applies after clip speed.
The soundtrack remains on the final edited-output clock and is not accelerated
by those speed controls. Source-time subtitle export is labelled **Composition
time** in this mode; edited-output export additionally maps global trim/speed.
ASS uses the fixed composition canvas and any global output geometry.

The **Selected source clip** player auditions one range at clip speed and stops
at its end. Selecting a timeline clip/cue or seeking maps to that registered file.
It is not a continuous final-effects preview: original waveform/JASSUB adapters
are disabled in this mode rather than displaying misleading source-time tracks.
Render a sample for actual cuts, captions, framing and mixed audio. Typing,
selection, moving a clip and navigating never start an encode. The processed
player remains revision checked, with stale results explicitly identified.

Canvas is fixed at composition creation from the initial video's reported size,
rounded to even dimensions and reduced to a maximum 4096-pixel edge. Clips fit
inside that canvas with black letterboxing. Assembly normalizes to 30 fps,
48 kHz stereo and a shared frame grid; silent clips receive silence. Output cut
boundaries and sample durations are frame-rounded. Unusual VFR, rotation/SAR,
codec combinations and motion-level sample/full frame equivalence are not yet
accepted. This is not a native-rate/lossless-master promise.

## Execution and integrity

The existing RenderCoordinator registers deduplicated path/hash clip sources.
Only the host's explicit native video grants can authorize a composition. Worker
transport uses asset IDs, hashes and pinned durations, never renderer-supplied
filesystem paths. All source bytes and durations are verified before assembly and
again before accepting cached/published output, including clips outside a sample.
These checks still read source files; a sample bounds *assembly*, not hashing.

`worker/media/composition` assembles only the intersection of global trim and
requested sample. Per-clip normalization produces one lossless FFV1/FLAC internal
segment, then the existing `encode_video` applies global edits, montage-timed
captions, soundtrack and final encoding. Intermediate timestamps are offset back
to composition time before caption burning. The cache includes composition,
canvas, requested interval and runtime identity; staging is cleaned after failure
or cancellation. A basic free-disk check is not a complete resource budget: long
or high-resolution compositions can consume substantial intermediate storage.

No second queue, engine, cloud service or automatic model acquisition is added.
OCR/inpainting inside a composition is explicitly rejected, not silently omitted.
Those tools remain available in separate single-source projects. Batch/folder
admission remains single-source; one composition is currently an Editor task.

## Projects, recovery and Library

Current project schema is **4**, including optional composition, soundtrack and independent text layers.
The schema-2 project reader is intentionally not retained under the repository's
greenfield rule. Old files are not rewritten. Recovery table schema stays 1 and
Library schema stays 2; unsupported embedded project documents fail without
migration, automatic reset or silent media loss.

Save/recovery captures the full applied document. Reopening first resolves the
original project anchor, then each distinct additional clip path/hash and music
through explicit native selection, requiring identical content and duration.
Repeated cuts share a prompt; moved matching files are accepted. Cancelling any
prompt or selecting changed bytes leaves the current Editor document intact.
The initial anchor is still required even when its clip has been removed; this is
not source-independent project browsing or automatic dependency repair.

Projects may be linked to their anchor or a composition member in Library. Saves
and exported videos also attempt links to the first known Library content record
for each distinct clip hash. Logical duplicate Library entries are not all linked,
and this is not the full derivation/deletion graph. A failed metadata association
never deletes a successful export. Every chosen clip path, music path and granted
original remains protected against project or export overwrite.

## Acceptance still owned by the application environment

The source controls and native/core behavior have separate evidence. Installed
Electron/EN/VI/IME/keyboard/screen-reader checks, dependency-resolved typechecking,
visual inspection and target-OS media acceptance remain unpassed here. Follow the
current integration report; do not mistake syntax/static checks for a UI run.
