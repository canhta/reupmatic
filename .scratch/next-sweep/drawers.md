# Drawers: UI audit and refactor plan (2026-09-27)

Owner request: "the app's drawers are still very poor: bad spacing, not using Astryx, too much text.
Scan them for a refactor."

## Sources and limits

A subagent read the code, the en/vi catalogues, the screenshots in `.test-artifacts/` and the Astryx
CLI docs. It edited nothing and ran no e2e.

- The `rail-*-clean-up-*` screenshots are stale (Clean-up was removed).
- Export is a Dialog.
- There are no screenshots of the Channels, Affiliate, Posts, Profiles, Labels or Library detail
  drawers. The findings for those come from code only.

## Root cause

Three hand-built drawer frames and about ten copy-pasted section patterns account for almost every
visible problem:

- inconsistent spacing;
- headings in the wrong size order;
- stacks of status sentences;
- walls of full-width number fields.

The fix is one shared `SidePanel` frame built from Astryx `Layout`, adopted by every drawer.

## A. Cross-cutting problems

- **A1 Three frames that each differ.**
  - `EditorSidePanel.tsx:27-59` with `editor.css:314-354`.
  - `DetailSurface.tsx:39-61` with `detail-surface.css`.
  - `JobsTray.tsx:45-59` with `workspace.css:148-192`.
  - The header height, padding, border and width differ between them, and they use raw px.
- **A2 The tool panel is narrower than the Astryx side-panel budget** (340–420): default 300, min
  280 (`EditorRegions.tsx:12`, `EditorWorkspace.tsx:130`).
- **A3 Heading sizes run in the wrong order.**
  - The panel title and section headings are both h5, which the theme sets to `--font-size-sm`,
    smaller than body text.
  - A string Collapsible trigger renders larger than either.
  - Eleven call sites override the trigger with `<Text>`.
  - In the Transcribe panel this gives: small → small → **large** → small → medium.
- **A4 Section headings repeat the panel title**: Voice, Transcribe, Edit and Audio. Translate and
  Style have no section heading, so the panels are inconsistent.
- **A5 The same four blocks are copied into four generators**: model readiness, progress with
  Cancel, and an error with a raw `<code>` (Speech, OCR, Translate, Synthesis).
- **A6 The primary action sits mid-panel with no footer**, and blocking reasons stack as separate
  sentences (Voice shows three).
- **A7 Number fields have random widths** (160/180/200/220/none), and units are written into labels
  instead of the `NumberInput units` prop.
- **A8 About 20 grey "supporting" help texts.** The Astryx layout docs say not to grey and shrink
  body copy.
- **A9 Empty `{}` JSX leftovers** in about 20 places.
- **A10 A legacy token layer.** `design-tokens.css` defines `--space-*`, `--edge`, `--bg-panel`,
  `--text-muted` and raw shadow and control-height values.
- **A11 A stale allow-list entry** `.astryx-collapsible-trigger` in
  `tests/core/astryx-internals.test.mjs:21`.

## B. Per drawer (summary; each item needs its en+vi copy change)

- **B1 Transcribe.**
  - Line length sits after the primary action.
  - Delete "Recognition engine: …".
  - OCR fields are 220 px wide.
  - The review repeats the heading, body and supporting text.
  - "Recognise" and "Recognize" are both used.
  - Target layout:
    - Speech group: language, readiness Banner, ▸ Line length, then the primary action.
    - On-screen text group: language, ▸ Advanced, then the primary action.
- **B2 Translate.**
  - Two separate status lines.
  - Rule rows say "Rule 1: find" and use a text Remove button.
  - The review has a RadioList whose descriptions restate the options, then a separate Review
    button.
  - The vi label reads "Ngôn ngữ lớp Bản chép lời".
  - Target: the policy becomes a Selector with option descriptions, and rule rows become
    TextInput + IconButton.
- **B3 Voice.**
  - Up to five status paragraphs.
  - The limits line sits at the top.
  - Progress comes after the primary.
  - The review table is 760 px wide inside a 300 px panel.
  - Four buttons in one row.
  - The voice-track RadioList.
  - Target:
    - A two-column Table with a StatusDot.
    - Save WAV and Save JSON go in a MoreMenu.
    - A Grid of NumberInputs with units.
    - Keep the billing line and the not-auto-saved warning.
- **B4 Style + Cover.**
  - "Customize this cue" is a disabled checkbox; make it a Selector "Apply to".
  - The templates are hand-built buttons stacked vertically, which pushes every field below the
    fold. Use a 2-column Grid of `SelectableCard`.
  - Colour fields stack four full-width rows; use a 2-column grid.
  - The cover band goes in a closed Collapsible with a 2-column `%` grid.
  - Bold, Italic and Uppercase become a `ToggleButtonGroup`.
  - "Inherit" becomes "Reset".
  - The SRT note moves to Export.
- **B5 Audio.**
  - The Music section is a dead end with no add action.
  - A lone Remove button.
  - About ten full-width fields.
  - Trivia descriptions.
  - Target:
    - A Grid of timing fields.
    - Ducking in a Collapsible.
    - The track as a ListItem with a MoreMenu.
    - "Mute original" instead of the current mute label.
- **B6 Edit.**
  - `update()` is duplicated.
  - Collapsibles are only 8 px apart.
  - Output aspect, fit and height are duplicated in Export.
  - The Fill hint is far from its field.
  - Redundant "Fade in/out" and "Overlay logo" checkboxes.
  - Seven text buttons in the composition panel.
  - Target:
    - `CollapsibleGroup hasDividers`.
    - Grids of fields with units.
    - A composition Toolbar (order ButtonGroup, Split, Join, MoreMenu) with Apply and Revert in the
      footer.
  - vi fixes: "Crop" → "Cắt khung hình", "render" → "bản xuất", "Editor" → "Dự án".
- **B7 Subtitles and Media.**
  - The Toolbar adds its own inset, so "Add cue" sits 12 px off the field line.
  - Media rows are crowded by the text button "Import into layer…"; move it into the MoreMenu.
- **B8 Export (Dialog).**
  - RadioLists without descriptions; use Selectors.
  - The primary sits inline with no Cancel.
  - The step list is a hand-built `<ul>`.
  - Target: `Dialog` + `Layout` + `LayoutFooter`, as in `LibraryBatchSheet.tsx:26-55`.
- **B9 Batch & jobs.**
  - A hand-built frame.
  - A global Escape listener with no `defaultPrevented` check.
  - Focus returns to a hard-coded element.
  - The queue sits below the full processing options.
  - Controls are split between the status row and the queue header.
  - Raw `<code>` in five places.
  - `batch.css` is dead or restyles Text.
  - A nested scroll area.
- **B10 Detail drawers (Channels, Affiliate, Posts, Profiles, Labels, Library).**
  - Bugs to fix first:
    - `PostPublication.tsx:210` renders an i18n key, not the text.
    - `TikTokPostOptions.tsx:70` shows raw privacy codes.
    - `ProfileManager.tsx:68-69,154,308-312`: the saved and exported messages never become
      visible.
  - Hand-built `.business-row-open` rows.
  - Channels has two primary buttons.
  - Library hides Reveal and Forget in nested Collapsibles, and uses a Badge for status.
  - Posts publishes stale values while the form is dirty, uses a free-text timezone and shows raw
    ISO timestamps.
  - Labels over two words: "Add channel", "Discard", "Remove", "Relink", "New post", "New profile".
  - About 12 help strings to delete.

## C. One drawer anatomy

`app/ui/design-system/SidePanel.tsx` replaces EditorSidePanel, DetailSurface, the JobsTray frame and
InspectorPanelSection. Record the ownership change in `docs/ARCHITECTURE.md`.

- **Structure:** `Layout padding={3} defaultHasDividers`.
  - Header: `LayoutHeader` with a level-4 Heading and an IconButton to close.
  - Content: `LayoutContent`.
  - Footer: `LayoutFooter` holding one primary action at `width="100%"`.
- **Width:** 360 by default, min 340, max 420. Below 1200 px it overlays at
  `min(380px, 100% - rail)`.
- **Spacing:**
  - Between sections: `VStack gap={5}`, with a Divider only between task groups.
  - Inside a section: `FormLayout`.
  - Paired fields: `Grid columns={2} gap={3}`.
- **Headings:**
  - A single-task drawer has no section heading.
  - A multi-task drawer uses level-4 headings per group.
  - Advanced options go in a closed Collapsible with a string trigger, or a
    `CollapsibleGroup hasDividers density="compact"` when there are several.
- **Status:**
  - One Banner above the primary, holding the first blocking reason and a "Set up" button in
    `endContent`.
  - Every other reason goes in the primary button's tooltip.
  - Progress replaces the primary while a job runs.
  - No raw codes.
- **Controls:**
  - `NumberInput width="100%" units isWheelEnabled={false}`.
  - `Selector`, with option descriptions where needed.
  - Row actions in a `MoreMenu`.
- **Shared component:** `GeneratorFooter({readiness, job, error, primary})` replaces the four copies
  in A5.
- **CSS to delete once migrated:**
  - `editor.css` side-panel, template-wrap, swatch, soundtrack-preview, review-rows and
    export-steps rules;
  - all of `detail-surface.css`;
  - `.jobs-tray*` in `workspace.css`;
  - all of `vision.css` and `batch.css`;
  - `processing.css`;
  - the drawer rules in `library.css`;
  - `.business-row-open` in `catalog.css`;
  - the token aliases.

## D. Slices (test first; each commit updates the e2e selectors it breaks to roles and labels)

1. Guard tests in `tests/core/ui-drawer-guards.test.mjs`: no `{}` JSX, no raw `<code>` errors, no
   Text trigger, no fixed NumberInput or Selector width, no supporting text outside an allow-list.
   Also drop the stale allow-list entry.
2. The `SidePanel` frame for Editor tool panels, width 360/340.
3. `GeneratorFooter` and the readiness Banner.
4. Transcribe and OCR.
5. Translate and its review.
6. Voice, its review and the voice track.
7. Style: templates, colours, cover band, scope.
8. Audio.
9. Edit, including the shared `EditingOptions` and `ProcessingOptions`.
10. The Export dialog.
11. The Subtitles and Media drawers.
12. Detail drawers onto `SidePanel`, fixing the three B10 bugs first, and adding screenshots.
13. Batch & jobs onto `SidePanel`, then removing the token aliases.

## Decisions (owner: "learn from other studios", 2026-09-27)

- **Q1 Yes.** The Music section gets an "Add music" action. CapCut's Audio panel offers "Add audio"
  directly. It reuses `importMedia`, and the empty state is never a dead end.
- **Q2 Split the settings as the studios do.** Output aspect and fit belong to the Edit canvas
  (CapCut's "Ratio" on the player, Premiere's Sequence settings). Output resolution (height) belongs
  to Export (Premiere and DaVinci export resolution). Export shows the aspect and fit read-only,
  with a link to Edit.
- **Q3 Studios toggle an effect live**, like Premiere's fx switch or CapCut's per-effect toggles.
  In the Editor, a field that previews instantly uses `Switch`: trim, crop, cover band, duck,
  mute, fades, logo. Automation profiles keep `CheckboxInput`, because there the value applies to
  the next run. Because these tools are shared, each surface passes its own control. Use small
  local repetition rather than a flag-driven abstraction.
