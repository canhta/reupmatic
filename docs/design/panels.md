# Panels

The app-wide standard for a panel: an Editor tool drawer, a detail drawer, or an options form such
as an automation profile. Every panel is built from one kit; feature code never hand-rolls a
section, a row, a status line or a command footer.

## The kit

`app/ui/design-system/Panel.tsx`:

| Export | Use |
|---|---|
| `PanelSections` | the panel's sections, a rule between each one that renders |
| `PanelPage` | a full-page panel (Settings), capped to `--panel-page-max-w` |
| `PanelSection` | a titled section; header holds `actions` (a list's Add), ↺ (`onReset`) and the on/off control (`isOn` + `onToggle`, body hidden while off) |
| `PanelToggleProvider` | sets the surface's on/off control for every section and `ToggleRow` below it |
| `PanelRows` | label-left rows (`FormLayout direction="horizontal-labels"`) |
| `PanelRow` | a row for a control without its own field label (segments, toggle groups) |
| `PanelPair` | two values that are one pair on one row; unlabelled inside a list row |
| `ValueRow` | a read-only fact as a row: text on one truncated line, or a richer value as given |
| `ToggleRow` | an on/off property as a row, drawn with the surface's control |
| `SliderRow` | a value tuned by feel: slider plus typed number with a unit |
| `PanelStatus` | one status line: dot, short title, optional inline action |
| `CommandFooter` | the one-row command bar (status, ⋯, primary; progress and Cancel while running); in a drawer footer, or inline at the end of a form or section |

### Empty sections

A section component may decide it has nothing to show (Settings' hosted providers, while no
protocol exists and none is stored) and render `null`. `PanelSections` draws its rule in CSS
between rendered sections only, so the page never shows a divider around nothing, and the
section owns its own data instead of the page loading it just to hide it.

### Read-only values: ValueRow, not MetadataList

Facts inside a panel (Settings Runtime and Account, the Library details and asset facts, a
run's facts in Run history) are `ValueRow`s inside `PanelRows`. They share the label column with
the editable rows beside them (Labels under the Library facts), so one panel has one label width
and one row rhythm; `MetadataList` draws its own label column and spacing. Text values truncate to
one line with the full value on hover; `PanelRows` gives every value cell `min-width: 0`, so a
long path or link never widens the drawer. `MetadataList` stays for a standalone record outside
the panel grammar, where its multi-column layout or show-more earns its place.

### Page width

A full-page panel wraps its content in `PanelPage`, which caps it at `--panel-page-max-w`
(`design-tokens.css`, 960px) and centres it. The cap is set by the page's densest content, the
offered-models table, so it never scrolls sideways; a wide window still keeps rows readable, as in
VS Code's Settings editor (content capped near 1000px and centred). A screen never sets its own
max width.

Every `PanelRows` on a page shares one label column, `--panel-page-label-w` (192px), so a
section whose labels are short (OCR) lines up with the sections around it; outside a page each
`PanelRows` sizes its label column to its own labels.

### Model lists

A list of installable models or extensions follows VS Code's Extensions view, JetBrains'
Marketplace list and Raycast's Store: the name and a one-line description lead the row, a few
quiet facts follow, and one install action sits at the end in a fixed-width column. In the
offered-models `Table`:

- Model: the id, then its purpose; the engine joins the description only when the id does not
  already name it.
- Task shows only while the task filter is All; a filtered list would repeat it on every row.
- Size, then the runtime's extra download only while that runtime is missing.
- Source: host, then licence, one line each.
- Action (168px): Download or Remove; while installing, a spinner, one short word or the
  percentage, and an icon Cancel. The full phase is the spinner's accessible name.
- The number of rows is plain text beside the filters, not a badge.

### Inline CommandFooter

A form or section that is not in a drawer (Folder rule form, Batch's new batch, Settings
Diagnostics) ends with `CommandFooter` inline, as its last child: the same one row of status, ⋯
and one primary, in the same place users meet it in drawers. It needs no wrapper; inside
`PanelSections` it gets the section rule above it like any section.

`app/ui/design-system/PanelControls.tsx`:

| Export | Use |
|---|---|
| `ColorRow` | swatch + hex |
| `PositionGrid` | 3×3 anchors |
| `FilterBar` | one toolbar row of facets above a list; those that don't fit move into an "N more" popover as label-left rows |
| `SelectionBar` | a multi-select list's bulk actions: "N selected", Clear, then the actions with one primary last; nothing while empty |
| `PathRow` | a picked file or folder: label left, the path on one truncated line (full path on hover), Choose…; Clear in ⋯ when `onClear` is given |

### FilterBar

`<FilterBar label facets end>`: each facet is `{ key, isActive, render(inline) }`. Inline, the
control sits in the bar with its label hidden; in the popover it is a labelled row. `end` holds
Clear all. A facet that is active while hidden in the overflow never disappears: the trigger keeps
"N more" and adds a `Badge` with the number of hidden active facets, and its accessible name says
"N more, M active". This follows Lightroom Classic, which keeps the active filter (the preset name,
such as Custom Filter, and its on/off switch) in the filmstrip even while the Library Filter bar
is hidden, because a hidden filter that still narrows the grid is the classic "where did my photos
go" trap ([Adobe: finding photos](https://helpx.adobe.com/lightroom-classic/help/finding-photos-catalog.html),
[Julieanne Kost: filters](https://jkost.com/blog/2024/06/using-filters-to-find-photos-in-lightroom-classic.html)).
Eagle likewise marks a set filter on its toolbar button instead of listing it
([Eagle: filter](https://en.eagle.cool/support/article/interface-filter)); the count badge is the
same marker for a group of facets.

### SelectionBar

`<SelectionBar count isDisabled onClear>{actions}</SelectionBar>` sits between a list's toolbar
and its rows (Library, Downloads). The count and a ghost Clear lead, so deselecting sits beside
what it undoes; the children are the bulk actions, the one primary last. A transient action, such
as Cancel while downloading, is just another child.

### PathRow

`<PathRow label value chooseLabel onChoose onClear?>` goes inside `PanelRows` (Batch and workflow output,
Folder rule source and destination, Settings export folder). Empty shows "None" in the secondary
colour. The visible button is always "Choose…"; `chooseLabel` is its accessible name and names
what it picks. Clearing is rare and undoes a choice, so it sits in the row's ⋯, never beside
Choose.

### Continuous controls

`SliderRow` and `ColorRow` draw their own draft while a drag or a colour pick runs and hand the
document at most one value per animation frame (`latestPerFrame`, `app/core/projects/continuous-edit.ts`),
so a frame that runs long delays the next instead of queueing every input event. Each drag or pick
is one gesture: inside the Editor, `EditGesturesProvider` merges its changes into one undo entry
(`changeEditor`'s `gesture` key), closed by the slider's release, the picker's native `change`, blur,
or the control unmounting. Typed values (the number or hex field) stay one edit each. A panel that
renders a preview only from the template, such as a template thumbnail, never keys it on the
document revision.

## One grammar

- **Sections** replace collapsibles. A rare section switches off in its header instead of folding
  away; there is no `Collapsible` in a panel.
- **On/off by surface.** An instant surface (the Editor) uses `Switch`; a surface whose values the
  next run applies (a profile, recipe or folder rule) wraps itself in
  `PanelToggleProvider value={CheckboxInput}`. A shared section never takes the control as a prop.
- **Rows:** one property per row, label left. A real pair shares a row; everything else stacks.
- **Reset:** an ↺ on the section, not a "Reset" button.
- **Commands:** one primary per task, inline at the end of its section, or in a one-row
  `CommandFooter` when it must stay visible while the body scrolls.
- **The primary follows the state:** when something blocks the usual command, the fix becomes the
  primary and the usual command moves to ⋯. Library details: a missing or changed source makes
  Relink the primary and Open in Editor a ⋯ item, as Lightroom Classic offers Locate for a missing
  photo; otherwise Open in Editor is the primary.
- **No wrapping:** no `wrap="wrap"` in a panel; everything fits at 280px.

`tests/core/ui-panel-guards.test.mjs` enforces the rules a scan can see: no `Collapsible` in the
renderer, no `wrap="wrap"` in a drawer or panel, and label-left rows only through `PanelRows`.

## Choosing components (by data, not taste)

| Data | Component | Why |
|---|---|---|
| On/off, takes effect instantly (mute, turn a section on) | `Switch` | AGENTS rule; one click, visible state |
| On/off that the next run applies (a profile, recipe or rule) | `CheckboxInput` | AGENTS rule; nothing changes until the run |
| Continuous value tuned by feel (volume, opacity, size, speed) | `Slider` + `NumberInput units` on the same row | drag for feel, type for precision (Resolve) |
| Exact number, not tuned by feel (sample interval, confidence, chars/line) | `NumberInput units` | a slider only gets in the way |
| Time (cue, trim, fade) | `TimeInput`, Start/End as a `PanelPair` | already the app's time format |
| 2–4 exclusive short options (mode, fit, aspect, max lines) | `SegmentedControl layout="fill"` | all options visible, one click |
| ≥5 options or long labels (language, voice, layer, font, preset) | `Selector` (search when >10) | saves space |
| Independent style flags (B / I / Aa, flip H/V) | `ToggleButton` icon-only, in a group | text-editor convention |
| 9-cell position (subtitles, logo) | `PositionGrid`: 3×3 icon `ToggleButton`s | pick the spot directly instead of reading "Bottom center" |
| Colour | `ColorRow`: native swatch + hex `TextInput` in `InputGroup` | Astryx has no ColorInput |
| Templates | 2-column `SelectableCard` grid with a preview | recognise by look, not by name |
| Collections (cues, media, clips, tracks) | compact `List` with dividers; row = name + meta + ⋯ | a narrow panel doesn't fit a Table |
| Switching between views inside a panel | `TabList` | navigation (Astryx rule: SegmentedControl is for values) |
| Command (Create, Generate) | primary `Button` in the footer; secondary in ⋯ | one primary per panel |
| State | `PanelStatus` (dot + short title); `Banner` only when it blocks the command | fewer boxes, fewer words |

## Wording

- Labels: 1–2 words. Buttons: one verb. No helper sentences.
- Errors and states: a short title, never an instruction paragraph.
- A failure title names its cause, with the next step when there is one ("Free up disk space",
  "Check your connection"); one generic title is only the fallback for an unknown code.

| Now | After |
|---|---|
| Invalid request — your text is retained. Check the selection. | Engine failed, try again |
| Invalid model manifest. Choose a different file. | Model invalid · [Set up] |
| Import an SRT file or add a cue at the playhead. | No captions |
| Recovery data is from an unsupported version and needs a reset. | Autosave off · [Reset] |
| Choose a file to attach / Save content labels | Attach / Save |
| Some lines overrun | 3 lines longer than their captions · shorten them |

A warning about some items counts them and leads to them: the voice review's long-line status
comes with "Go to long line" in ⋯, and each long row selects its caption and moves the playhead,
as ElevenLabs Dubbing Studio flags a clip whose speech outgrows its segment
([Dubbing Studio](https://elevenlabs.io/docs/eleven-creative/products/dubbing/dubbing-studio)). A line
sped up to fit is not a warning: its row only reads its speed ("1.12×") as plain text.

## Sizing and density

- **Density:** each Editor panel is wrapped in `SizeProvider size="sm"`, so every control shares one height. This is a desktop studio, not a form page.
- **Width:** both sides default to 320px (min 280, max 480, resizable). Everything is designed for 280px: nothing may break at that width.
- **Rows:** the label column sizes to the section's longest 1–2 word label, the control fills the rest, units inside the control (`NumberInput units`). A pair shares a row (`PanelPair`) only if it's a real pair (Start/End, In/Out); otherwise stack. **No `wrap="wrap"` in panels.**
- **Spacing:** rows take FormLayout's own step (12px), sections `gap 4` (16px) with a `Divider` between them, panel padding `3` (12px).
- **Order:** in each panel, the order the user works (input → options → output). Frequent controls come first; rare ones go at the end of their section, visible, not hidden.

## Processing recipe (profiles, workflows, batch, folder rules)

`features/processing/ProcessingOptions.tsx` is one surface under
`PanelToggleProvider value={CheckboxInput}`: the next run applies it. Header: title and ⋯ (Reset
edits, Reset style). Sections, all visible: the Editor's own Frame, Speed, Crop, Color, Fade and
Original; **Screen text [Checkbox]** (Language · Sample (s) · Confidence [Slider %]; while
subtitles are attached it cannot switch on and says so in its status); then the Text panel's
Font, Position, Background, Cover original and Animation.

## Editor

### What studios do

- **CapCut:** the left panel *creates* content (Media, Text, Captions → Auto captions). The right panel *adjusts* the selected thing (Text: style, Animation, Text to speech).
- **Premiere 25:** the Text panel creates captions (Transcript → Create captions). One context-aware **Properties** panel holds all formatting for video, audio and text.
- **Resolve:** Inspector tabs by object (Video, Audio). Each section has a header with a reset arrow. Each property is one row: label, slider, value.

Shared pattern: **create on the left, adjust on the right; one object per tab; one property per row; almost no prose.**

### Our problem

Eight tabs are split by *function* (Transcribe, Translate, Voice, Style, Audio, Edit…), not by *what the user works on*. Each panel invents its own layout, and collapsibles appear with no rule.

### New map

| Rail | Before | After |
|---|---|---|
| Left: create | Media, Subtitles | **Media**, **Captions** |
| Right: adjust | Transcribe, Translate, Voice, Style, Audio, Edit | **Text**, **Audio**, **Video** |

- **Captions** (left) = everything that *makes* a caption layer: layer + language, the cue list, and one **Create** command (source: Speech · Screen text · SRT) plus **Translate**.
- **Text** (right) = how captions *look*: Templates, Font, Background, Animation.
- **Audio** (right) = everything you *hear*: Original, Voiceover (TTS), Music.
- **Video** (right) = the clip: Trim, Speed, Fade, Logo.

8 tabs → 5.

### Editor layout

Editor panels are tool inspectors, not detail drawers: the drawer header/body/footer rule bends to
what helps the user. A command sits where it is used.

```
┌ Title                  [+] [⋯] [✕] ┐  header: title; list-level Add/⋯ only where natural
│ [ View A | View B ]                │  header: view tabs, for a panel with two views
│ ── SECTION ─────────── [↺] [●on]   │  section: name, reset, on/off switch
│ Label      [control ───────── 12 s]│  row: label left, control right, unit
│ Label      [control              ▾]│
│ ── SECTION ─────────────── [+]     │  section: its own list Add
│ Label      [control              ▾]│
│                        [ Command ] │  command inline, at the end of its section
├────────────────────────────────────┤
│ ⚠ Short status…    [⋯] [ Primary ] │  footer (only where it helps): ONE row, fixed height
└────────────────────────────────────┘
```

- **Rows:** `FormLayout direction="horizontal-labels"`. Ranges use `Slider` plus a number with a unit.
- **Section on/off:** a `Switch` in the section header (Ducking, Fade, Logo, Background). When it's off, the body is hidden. This replaces collapsibles; there are no collapsibles at all.
- **Reset:** an ↺ icon on the section, not a "Reset style" button.
- **Commands:** one primary per task. A command sits inline at the end of the section it belongs to
  (CapCut's Generate under its options, Resolve's Inspector has no footer). The drawer footer is
  used only where it helps: one command for the whole panel that must stay visible while options
  or a long draft scroll (Captions › Create, find & replace, Audio › Voiceover). The footer is
  always one row of one height: status at the start (dot + one short phrase — cause, then next
  step if any — truncated to the row, full text on hover), then ⋯ and the primary. A running job's progress takes the status's place and Cancel
  the primary's. A missing or invalid model turns the primary itself into Set up; an out-of-date
  draft turns Apply into Review. Why a command waits is its tooltip, never a status line; a block no
  setup lifts (a composition for Speech and Screen) is the status instead, and hides Set up. A view
  places its `CommandFooter` through `DrawerFooter`. A panel with two modes uses a
  `SegmentedControl` at the top of the body; two views use a `TabList` in the header.
- **Lists:** row = name + meta, with ⋯ at the end. A list's Add goes in the drawer header when the
  list is the panel, otherwise in its section header.

### Editor panels

**Media** (left) · header `[+]`
- Rows: kind icon · name · duration (and "On timeline"/"Imported into …" as plain text) · ⋯ (Relink, Add to timeline, Import into layer, Remove). Drag to the timeline as now. A missing file shows as a warning `StatusDot` on the row. A `Thumbnail` needs a poster for project media, which only Library assets have today; until then the row keeps its kind icon.

**Captions** (left) · header `TabList [Cues | Create]`
- *Cues:* header `[+ Cue] [⋯ Find & replace, Copy layer, Shift timing]`.
  - Row `Layer [Selector]`, row `Language [Selector]`, then `Search` full width, then the list.
  - Row: `0:00.0–0:02.0` + text (2 lines). The selected row expands: `TextArea`, then `Start`/`End` on one row, then ⋯.
- *Create:*
  - `Source [Speech | Screen | Translate | SRT]` (SegmentedControl).
  - Speech: Language, Line length `[Auto | Custom]`; Custom adds Chars/s (units cps), Lines `[1 | 2]`, Max chars.
  - Screen: Language, Sample (s), Confidence (Slider %).
  - Translate: From layer, Language, To language, Rules (section with [+], rows Find → Replace with ⋯).
  - SRT: Layer; the footer's `[Import]` opens a caption picker filtered to the formats the importer parses (SRT, ASS), like Premiere's and CapCut's own caption import.
  - Footer (kept: the command stays visible while options or a long draft scroll): one row — status (unavailable in compositions, model problem, last error, or a notice such as lines needing a re-split), ⋯ Check again (and Re-split for Speech), `[Create]` (or `[Set up…]` when the model is missing; the reason it waits is its tooltip).
  - When a draft is ready, the body shows the draft rows and the footer shows `[Discard] [Apply]`.

**Text** (right) · header ⋯ Reset all
- Top rows: `Burn in [Selector]` (the shown layer, the one burned into the export; styles are global, like a Premiere track style) · `Apply to [All | Selected]`.
- **Templates:** SelectableCard grid.
- **Font:** Family [Selector] · Size [Slider + %] · Style [B I Aa] · Colour · Outline (colour) · Outline width · Shadow · Spacing.
- **Position:** 3×3 grid · Margin X · Margin Y.
- **Background [Switch]:** Colour · Opacity [Slider %] · Padding [Slider ×, independent of the outline]. On means a box opacity above zero. One box per cue (libass BorderStyle 4); no corner radius, because libass cannot draw one.
- **Cover original [Switch]:** Offset (Left/Top) · Size (Width/Height) · Colour · Opacity · [Fit] inline when OCR regions exist.
- **Animation [Switch]:** In [Selector] + time (s) · Out [Selector] + time (s) · Emphasis [Selector] · Accent.
- Every section header except Templates has ↺ (a template is a preset, not a setting).

**Audio** (right)
- **Original ↺:** Volume [Slider + dB] · Mute [Switch].
- **Voiceover:** From layer [Selector] · Voice [Selector] · Language · Lines [Selected | All]. A draft lists each line with a fits/overruns dot, [Listen] then "I listened"; the footer turns into ⋯ (Generate voice, Save WAV/JSON) + `[Apply]`. After applying: Mode [Mix | Replace] · Volume · Fade (in/out pair). The footer holds `[Generate voice]` — the panel's one command, visible while Music scrolls — with ⋯ Check again, Remove voiceover. From layer defaults to the track's own layer, else Translated text when it has cues, else Spoken text (CapCut dubs the translated captions); the track goes stale with that layer.
- **Music** [+ in the section header]: track row with play/pause and ⋯ (Replace, Remove) · Mode [Mix | Replace] · Volume [Slider] · Range (start/end pair) · Offset · Fade (in/out pair).
- **Ducking [Switch] ↺:** Amount [Slider dB] · Release (s). Shown once a music track exists.

**Video** (right)
- **Frame ↺:** Aspect [Selector — five options] · Fit [Fit | Fill] · Rotate [0° 90° 180° 270°] · Flip [H V].
- **Trim [Switch]:** Range (Start/End pair).
- **Speed ↺:** [Slider 0.5–2×, mark at 1×; the typed value takes 0.25–4×] · output length.
- **Crop [Switch]:** Offset (Left/Top pair) · Size (Width/Height pair).
- **Color ↺:** Brightness · Contrast · Saturation, each a slider.
- **Fade [Switch] ↺:** In / out (pair, s) · Audio [Switch].
- **Logo [Switch] ↺** [+ Add image in the header]: Image [Selector of project images] · Position 3×3 · Size [Slider %] · Margin · Opacity [Slider %]. Images come in through the native picker as project media, so a browser FileInput (no file path) does not fit.
- **Clips** (composition only): rows = index · name · range and speed; the selected row expands to In/Out (pair) and Speed with inline [Revert] [Apply], and its ⋯ holds Earlier, Later, Split, Join, Remove.

### Not in this pass

A selection-driven inspector (click a clip to see its properties) needs a timeline selection model the editor doesn't have yet. For now, tabs by object.
