# Subtitle appearance and independent export — 0.11

The Editor Appearance disclosure has Global and Selected cue scopes. Change font
family, font size, text/outline/box colors, outline or shadow, box opacity, 9-way
placement, horizontal/vertical margins, character spacing and bold/italic. Fields
form a draft until Apply. Reload discards that draft; Inherit removes the relevant
explicit override. A cue override is a complete appearance snapshot, not a partial
cascade; later global changes affect inherited cues only. Changing selection or
history does not silently apply a stale draft to another cue. Applied style is
included in undo, project save and recovery.

Typography is frame-relative: size, outline, shadow, vertical margins and spacing
are percentages of frame height; horizontal margin is a percentage of frame width.
An opaque/translucent box uses ASS boxed borders instead of separate outline/shadow.
Colors use #RRGGBB. Font family names cannot contain injected ASS/filter commands.
The named font must exist locally; no fonts are bundled/downloaded or embedded in ASS.

JASSUB previews the source-frame subtitle canvas. Processing prepares ASS against
the edited output frame size, then burns source-time cues before changing playback
speed. Use actual sample rendering to inspect crop/framing/speed and audio together;
the original player is not a live transformed-video preview. Global appearance is
shared with processing profiles/batch/folder/workflow recipes. Per-cue overrides
remain in the cue document. A style-only recipe never requires AI models.

Export subtitles offers two explicit choices independent of video rendering:

- SRT: visible text and millisecond timing, with no font/color/position fidelity.
- ASS: current global/per-cue appearance and canvas geometry; format timestamps
  have centisecond precision. Font availability still affects another player's result.

Source timing leaves cue positions on the original clock. Output timing clips and
retimes cues through current video trim/speed without modifying Editor cues, and
uses edited frame geometry for ASS. The chosen destination uses the native save
flow and source-alias protection. Library-origin exports become subtitle assets.
Literal braces and backslashes are not accepted as author-supplied ASS commands.

Serialization requires the project's actual pysubs2 dependency. Missing it returns
COMPONENT_MISSING; there is no handwritten parser or fake production fallback.
Current checks distinguish pure style math and FFmpeg processing from real serializer
round trips, which require the installed dependency. Advanced typography, multi-cue
styling, style presets, font management and independent language layers remain open.
