# One local soundtrack — 0.11

In Editor, open Soundtrack and select a local audio file natively. Listen previews
the original audio file only, not the eventual trim/mix. Edit start/end within the
music source, placement offset in the edited output, gain and fade durations. Choose
Replace or Mix, then Apply. Unapplied form drafts do not become project data; Reload
restores the applied recipe. Remove also needs Apply. Applying/removing is undoable.

Replace suppresses original audio. Mix uses the existing original-audio mute/gain
and playback speed alongside the independent soundtrack; mute-original does not
mute music. The mix limiter avoids uncontrolled summing gain. Music is not looped,
ducked or time-stretched with video. Its placement is on the output clock after
video trim/speed: trimming the source and speeding it up do not accelerate the song.
Outside the selected music interval the replacement output is silent; mixed output
retains original audio when not muted. All output retains the requested video duration.

Render a sample to hear the real result, then render full video through the same
coordinator and worker. Sample placement intersects the full output timeline rather
than restarting music at each sample. Fade durations refer to the selected music
clip, including when only a sample intersects it. Original input bytes remain intact.

Applied track data stores native path/name/hash/duration plus edit settings. Project,
undo and local recovery retain it. Opening a project/recovery always asks you to
choose the matching audio file natively, even when the saved path exists. Matching
bytes at a relocated path work; different bytes fail, and cancelling leaves the
previous Editor state rather than silently omitting music. This is a file grant,
not automatic trust in arbitrary paths embedded in a project.

Worker registration, sample/full cache identity and final publication all check
soundtrack SHA-256. Original audio/video paths cannot be selected as export targets.
A changed file must be selected as a new input, not accepted under its former identity.

Limits: one local clip, up to 24 hours; -60 to +24 dB; valid trim bounds; fade-in plus
fade-out cannot exceed the selected clip. Project-specific music is excluded from
processing profiles and existing source-only batch/folder/workflow inputs. No TTS,
voice generation, music downloading, multitrack timeline or automatic looping exists.
