# Astryx component selection — Reupmatic 0.11

Owner-directed policy, reviewed 2026-09-15. Read the root AGENTS.md first.
**Not a component-count target:** maximize task-appropriate reuse, not the number
of library exports in an import list. Do not turn the editor into a showcase.

## Evidence and version boundary

The manifest targets core/theme/CLI 0.6.1. The public catalogue and official
`facebook/astryx` component documentation/source were read on 2026-09-15. See
[the inventory](astryx-inventory.json) for observed groups, per-category decisions
and source links. Compound exports belong to their parent category; the inventory
is not a claim to enumerate every installed export. Upstream `main` can differ
from 0.6.1. Registry DNS failed here: the package CLI, exact package types,
foundation rendering, screenshots and Electron interactions remain **NOT RUN**.

After dependency installation, review the actual CLI output before further UI work:

```sh
npm run astryx -- component --list
npm run astryx -- docs
npm run astryx -- docs migration
npm run astryx -- docs theme
npm run astryx -- docs styling
npm run astryx -- docs tokens
npm run astryx -- template --list
npm run astryx -- component AppShell
npm run astryx -- component RadioList
```

Read the exact component docs for each task. A template is a composition reference,
not permission to import its visual noise, dummy metrics or unrelated workflow.

## Task → component → reason

| Task | Selection | Deliberately not selected |
| --- | --- | --- |
| Persistent five-area frame | AppShell + SideNav/SideNavItem | Buttons posing as navigation; nested main landmarks; duplicate shell |
| Sources Library / Downloads peer views | TabList + Tab with `role="tablist"`, stable IDs and a labelled panel | SideNav inside SideNav; Buttons posing as tabs; navigation starting downloads |
| Library record comparison and current-page selection | Table + CheckboxInput with indeterminate page selection | Cards per video, invisible cross-page selection or implicit batch execution |
| Reference/copy and reuse/separate import policies | RadioList with visible consequence text | Pre-hidden storage policy, silent duplicate processing or an upload wizard |
| Source paths, linked files and runtime facts | MetadataList | Editable-looking TextInput, metric cards or dense badges for read-only facts |
| General / AI & processing / Account settings | Section with optional advanced runtime Collapsible | A long onboarding wizard, arbitrary nesting or fabricated plan information |
| Model setup transaction | Button + cancellable ProgressBar + persistent Banner | Automatic download on mount; a fake ready checkmark after file selection |
| Subtitle commands | Named Toolbar with wrapping action group | Unlabelled icon-only controls; every action styled primary |
| Preview beside editable cues | Specialist media surface + Table | Carousel, cards per cue, marketing hero; no width-distorting forced aspect ratio |
| Precise cue/sample offsets | NumberInput inside domain TimeInput | Astryx TimeInput is a clock-style control, not arbitrary millisecond media offsets |
| Bilingual multiline cue text | TextArea | Rich text/Markdown that changes subtitle content semantics |
| Locale / OCR language | Selector with separate state | One shared language switch that rewrites content |
| Folder first-run scope | RadioList, initially no choice | Hidden dropdown alternatives or a preselected scope that silently processes old files |
| Include subfolders | CheckboxInput | Switch: this is a saved draft option, not an immediate effect |
| Inpainting target | RadioList: region / automatic text | SegmentedControl that presents consequential processing modes as cosmetic views |
| Folder form / vision tools | Section | Card for every group; fabricated sequential Stepper |
| Queue and folder records | Compact Table with descriptive actions | Cards per row; badge for every count, timestamp or healthy state |
| Optional queue / OCR evidence | Collapsible | Hand-written toggles; hiding cancellation, required fields or critical warnings |
| Processing feedback | ProgressBar using real fraction/indeterminate | Fake percentages; progress still moving after failure/completion |
| Persistent error / missing model | Banner with cause and recovery | Toast as the sole record of a background failure; generic empty state on failure |
| Empty video / cues / queue / rules | EmptyState with guidance | Invented sample activity; loading misrepresented as no data |
| Destructive edit confirmation | AlertDialog | window.confirm; custom modal/focus trap |
| Exceptional row state | Badge only where attention is needed | Green success pills in every healthy row |

## Deliberate exceptions

Keep `@xzdarcy/react-timeline-editor`, WaveSurfer and JASSUB: generic UI controls
cannot replace their timing, audio and subtitle responsibilities. Native video
controls, filesystem pickers and semantic layout HTML are valid platform seams.
The domain TimeInput converts media units; the editor owns commit/undo semantics; it is
not a new visual primitive. Source paths use native pickers because browser
FileInput cannot grant the host a trusted directory handle in this architecture.

Do not add Chat, charts, calendars, an app-wide command palette, extra tabs, dropdown
menus or toast infrastructure merely because the catalogue contains them. Introduce
these when an approved user task requires them, then document the choice and tests.

## Hierarchy and state review

Use the same neutral theme and compact density in every area. The editor remains
a workbench: navigation → title/file actions → media/cue editing → timeline →
render controls → optional local vision. The shared queue stays mounted across
area changes. Closing a disclosure does not cancel work. Keep user edits, stale
result protections and explicit run/save boundaries.

Group related messages rather than stacking many same-status banners. Normal
status and count text is quiet; errors and required follow-up stand out. Optional
advanced OCR controls and evidence may collapse, not language, run/cancel or model
availability. Do not give the source and output pickers fake completion steps.

CSS owns geometry. Astryx owns control padding, colors, focus and internals. Keep
resets below Astryx layers, use documented tokens, and never re-skin `button`,
`input`, `td` or library private selectors globally. A secondary legend or disabled
reason is not a substitute for a real labelled field.

## Acceptance gates

- Source guards: single UI system; documented imports; native-control exceptions;
  single root agent file; readable modules. These are regression aids, not UX scores.
- Installed types/build: check category exports, ref/event props, React 19 peers,
  specialist library compatibility, theme/i18n API and CSS cascade.
- Interaction: keyboard side navigation, toolbar arrows, dialog Escape/focus return,
  NumberInput blur/Enter, Vietnamese IME, draft preservation, collapse while running,
  cancellation, stale results and no model download on navigation.
- Visual: real EN/VI empty/populated/error/running screenshots at desktop widths
  and enlarged text. Inspect long labels/paths, table scrolling and reduced motion.

Record current execution in `research/integration-0.11/RESULTS.md`; earlier logs
remain historical evidence. Never call this
interface visually approved from source inspection alone.

## Primary references

- https://astryx.atmeta.com/docs/getting-started
- https://astryx.atmeta.com/components
- https://astryx.atmeta.com/docs/migration
- https://astryx.atmeta.com/docs/tokens
- https://github.com/facebook/astryx/tree/main/packages/core/src

Layout CSS is now colocated with shell/editor/batch/folders/vision. Native media
aliases use the selected neutral theme tokens; the previous 0.5 graphite/mint
palette and direct control selectors are not active application styles.

## 0.7 API review notes

The official component source/docs were consulted before adding Sources and
Settings. TabList defaults to navigation semantics; Sources explicitly uses tab
semantics and `panelId`. Collapsible state is controlled with `isOpen` and
`onOpenChange` so Library staging can expose the existing batch draft. EmptyState
uses the documented `actions` slot, not an invented singular prop. RadioList
choices remain visible before submission; MetadataList represents read-only facts.

These checks use upstream documentation, not installed 0.6.1 types. Verify the
resolved package and keyboard behavior before claiming compatibility. Review
Library search/selection changes, import cancellation, long EN/VI filenames,
Settings setup failure, disabled accounts/downloads and reopening a linked project
in actual Electron. Do not turn source guards into a screenshot or usability pass.


## 0.8 recipe choices

The task is to choose optional processing steps for an existing render, batch or
folder admission, not to configure a second execution engine. ProcessingOptions
is a shared business composition. It deliberately uses CheckboxInput for deferred
recipe choices, not an immediate Switch; RadioList for automatic/manual removal
with consequences; Selector for a compact content-language choice independent of
UI locale; and NumberInput for confidence, media sampling and normalized-region
percentages. Advanced sampling detail is Collapsible, but the selected steps,
subtitle conflict and 960-pixel/24-fps removal warning remain visible.

Section provides one quiet task region rather than a card per option. Banner is
reserved for errors and output-quality warnings. Saved queue/rule recipes use
plain descriptive text, not decorative badges. No Stepper implies that choosing
an option has executed a stage; controls never trigger inference themselves.

MaskRegionFields shares normalized/percent semantics with the existing inpainting
sample controls. It is not a local NumberInput wrapper. Existing timeline,
WaveSurfer, JASSUB, media controls and native pickers retain their responsibilities.

The official RadioList and CheckboxInput implementations were reviewed for child
composition, value/onChange and disabled-state semantics. This is source evidence,
not verification of the uninstalled pinned package or rendered accessibility:

- https://raw.githubusercontent.com/facebook/astryx/main/packages/core/src/RadioList/RadioList.tsx
- https://raw.githubusercontent.com/facebook/astryx/main/packages/core/src/CheckboxInput/CheckboxInput.tsx

Owner-side interaction checks should cover enabling/disabling steps, manual-mask
bounds, imported subtitles after OCR selection, keyboard/IME, long Vietnamese
labels, cancellation visibility and unchanged drafts after a failed admission.


## 0.9 task-first workspace choices

| Task and states | Selected composition | Deliberately not used |
| --- | --- | --- |
| Channels, links and posts have peer views; drafts survive navigation | TabList/Tab with tab/panel IDs; persistent business panels | A second app shell, dashboard cards or a navigation item per record |
| Compare/search/edit local records, empty results and paged lists | Compact Table with labelled row actions; EmptyState and normal count text | Decorative metric cards, fabricated publishing badges or a generic CRUD wrapper |
| Edit a channel/profile/workflow draft and explicitly save/archive it | FormLayout, TextInput/TextArea, Selector, CheckboxInput and shared confirmation lifecycle | Immediate Switch semantics for deferred saves or submit-on-selection |
| Pick existing shared category/tag identities | Search plus CheckboxInput in LabelPicker; contextual catalog management | Free-form labels with per-screen IDs or a separate mandatory setup wizard |
| Review post details, export identity and chosen link references | MetadataList and explicit edit actions | Treating a source as a finished export or using a badge to imply publication |
| Set an optional intended publication wall time with timezone | DateTimeInput; TextInput for the explicit IANA zone; Selector only for repeated-hour choices | Media TimeInput, a hand-built calendar, silent machine-zone inference or a fake scheduler |
| Save/apply a reusable recipe independently from execution | Existing ProcessingOptions plus ProfilePicker and an explicit Apply action | A second processing engine, auto-run selection, or per-video mask reuse |
| Inspect workflow runs and recover incomplete admission | Table/MetadataList using shared batch state and actions | Another queue, unverified success counters or arbitrary DAG decoration |
| Keep persistent errors actionable | Banner with endContent retry/action slot | A transient toast as the only record of failure |

Forms retain unsaved state through the catalog draft lifecycle. Sharing stops at
real invariants: no local primitive Button/Input component, prop-for-prop wrapper
or configurable do-everything form. DateTimeInput is used for a calendar instant,
not subtitle duration. The domain resolver keeps wall time, IANA zone and stored
instant separate and requires a choice for an ambiguous time.

Source review confirmed the pinned v0.6.1 DateTimeInput value/onChange contract and
Banner endContent slot. This is not an installed-package or keyboard/visual pass.
The actual EN/VI desktop still needs the owner-run checks listed above.

- https://raw.githubusercontent.com/facebook/astryx/v0.6.1/packages/core/src/DateTimeInput/DateTimeInput.tsx
- https://raw.githubusercontent.com/facebook/astryx/v0.6.1/packages/core/src/Banner/Banner.tsx


## 0.10 task compositions

The existing direct Astryx imports remain the control source; no new primitive
library or Button/Input wrappers are introduced. `NumberInput` expresses bounded
source times, percentages, speed, gain and color adjustments; `CheckboxInput`
selects crop/trim/mute and match-case behavior; `Selector` chooses aspect, fitting
and text-rule scope. `Collapsible` groups secondary editing/rule/recovery details
without hiding cancellation or failure feedback. `Table` shows before/after text
and recoverable documents; `Banner` exposes stale results, failed saves and model
limits. `Button` remains the explicit preview/apply/export/retry action.

VideoTools/AudioTools own editing semantics, not primitive forwarding. Shared
ProcessingOptions gives Editor, profiles, batch and automation the same contract.
The original specialist media player, JASSUB, WaveSurfer and timeline remain;
processed sample playback is native output, not a cosmetic transform preview.
Component selection uses the existing inventory and official category docs.
Actual installed Astryx type checking, visual composition, keyboard/IME and
accessibility verification remain outstanding while dependency installation is
unavailable; static import/policy checks are not a UI approval.


## 0.11 task review

Pinned 0.6.1 NumberInput and Selector source plus the official catalogue were
reviewed on 2026-09-16. This is source API research, not an installed type/visual test.

| Added task | Reuse and rationale | Avoided |
| --- | --- | --- |
| Library derived assets | Existing TabList peer + Table, scoped Selector/TextInput, MetadataList and explicit file actions | Gallery cards, fabricated health badges or a second Library |
| Soundtrack draft | Collapsible + RadioList with replace/mix consequences, precise NumberInput and explicit Apply/Reload | Cosmetic mode toggle, inferred audio permission or controls that auto-render |
| Subtitle appearance | Scope Selector, shared staged form, NumberInput/TextInput/CheckboxInput | A local primitive kit, one wrapper per field or dense color swatches with hidden meaning |
| Subtitle export | One optional disclosure, RadioList for format fidelity, timing Selector and one save action | Four extra toolbar buttons without explaining format loss |
| Exact asset preview | Native audio/video or read-only cue Table, persistent missing/changed Banner | Editor overwrite on selection, fake thumbnail/duration or custom media transport |

Native audio is a deliberate specialist playback boundary like existing video;
its controls are not re-skinned. The style form shares draft, conflict and inheritance
behavior across actual callers rather than merely forwarding props. Hex color fields
avoid introducing an unverified color-picker dependency. Font names are explicit
local inputs, not fabricated lists of installed fonts. Multi-cue styling and native
font enumeration remain scope gaps.

Pinned references:
- https://raw.githubusercontent.com/facebook/astryx/v0.6.1/packages/core/src/NumberInput/NumberInput.tsx
- https://raw.githubusercontent.com/facebook/astryx/v0.6.1/packages/core/src/Selector/Selector.tsx


## 0.12 — Clip composition task

Arrange source ranges without turning a Library batch into one video. Reuse Table
for clip/source/composition comparisons, Button for explicit select/move/split/join,
NumberInput for staged seconds/speed, Collapsible for the secondary tool group and
Banner for a failed or stale draft. Existing confirmation handles discard/removal.
The specialist timeline gets a read-only clip row; no bespoke draggable primitive
or second timeline engine. The native video element is a clearly labelled source
range audition, not an Astryx replacement or simulated final-effects preview.

Required states: no composition/start; native-pick pending/cancel/failure; staged
vs applied range; stale/reload; invalid range/playhead; 64-clip/one-clip limits;
unsupported AI; actual processed output and stale result. Every new string is EN/VI.
Existing spacing, neutral theme and cue-list enclosure are reused without new
visual tokens. Alternatives rejected: a generic card per clip, table-row raw
buttons, sliders for precise source ranges, or silently draggable hard-cut spans.

Installed CLI discovery was attempted and failed because dependencies are absent.
Official v0.6.1 Table and NumberInput source plus Button documentation were reviewed;
timeline source documents movable/flexible action flags. These are API research,
not installed-type or rendered-UI verification. See the versioned skills record.


## 0.13 — Independent text and local recognition review

Task: edit one of four independent text layers and review generated source text
without destroying corrections or suggesting that voice/translation has run.
Reuse the existing cue editor and specialist timeline rather than another screen.

| Choice | Task and rationale | Alternative rejected |
| --- | --- | --- |
| Section + Selector | Current layer and source-language selection with real counts/provenance; compact choices independent of UI locale | A workflow Stepper falsely implying every layer is generated in sequence |
| Existing cue Table/timeline | Full text/timing tools follow the selected layer | Four duplicate editors or a cramped read-only text tab |
| Collapsible + Table | Optional copy/STT before/after review, first 25 rows clearly bounded | Silent whole-track replacement or decorative cards per segment |
| Button and existing confirmation | Explicit native setup, run, cancel, reviewed-keep-edits, copy/apply | Auto-start effects, switches that commit silently, local control wrappers |
| Banner + plain status + ProgressBar | Persistent unavailable/failure/stale states and reported work progress | Toast-only errors, fake percentages or a healthy badge on every row |

Cancellation and execution prerequisites stay visible. New UI strings, reason
states and accessible labels are EN/VI; user text and language never follow the UI
locale automatically. Setup selects an existing local manifest; unavailable SDKs
or models do not launch a downloader. Rendered media remains displayed text only.
There are no new palette/font/animation primitives.

The three installed Astryx CLI commands were attempted again and failed with
MODULE_NOT_FOUND; see integration-0.13/logs/astryx-discovery.txt. Controls reuse the
existing category imports and source-reviewed composition APIs; packageVerified
remains false. Static source/import checks are not an installed package, screenshot,
keyboard/focus, responsive layout or Vietnamese IME pass.


## 0.14 translation review decisions

Native manifest selection uses the host dialog; setup/rules use Collapsible.
Selector keeps source and content-language direction explicit. RadioList exposes
keep-existing vs destructive replacement before review, rather than a misleading
immediate Switch. CheckboxInput (`value`, not `checked`) supplies separate whole-layer
replacement confirmation. Table compares IDs/text/timings with named pagination,
not card-per-cue decoration. ProgressBar shows real progress/indeterminate state;
Banner explains failure/staleness without colors alone. Existing Section/Button /
TextInput primitives and neutral-dark styles are reused, with no new control kit,
font binary or motion. All choices have EN/VI labels. Start and apply are distinct
task groups; neither selection nor disclosure triggers inference or application.

Pinned primary signatures inspected (package installation not claimed):
- https://github.com/facebook/astryx/blob/v0.6.1/packages/core/src/CheckboxInput/CheckboxInput.tsx
- https://github.com/facebook/astryx/blob/v0.6.1/packages/core/src/RadioList/RadioList.tsx
- https://github.com/facebook/astryx/blob/v0.6.1/packages/core/src/TextInput/TextInput.tsx

Installed CLI discovery was attempted but unavailable. This is source/API review,
not loaded-library type validation or rendered keyboard/IME/visual acceptance.


## 0.15 — Local voice setup, audition and export

Task: choose spoken cues and an explicitly configured preset, then compare captured
words and natural audio timings, listen and save without implying video alignment.

| Choice | Task/states and rationale | Alternative rejected |
| --- | --- | --- |
| Section + Selector | One voice task region; independent scope/content-language/preset choices, explicit empty/unavailable reasons | New task area, sequential Stepper, voice choices disguised as account settings |
| Collapsible | Optional model setup details; run/cancel and prerequisites stay visible | Extra mandatory setup screen or auto-download effect |
| Table | Paginated captured words, source clocks, actual audio spans/durations | Decorative per-cue cards or hidden truncation of comparison rows |
| Button + CheckboxInput | Explicit generate/listen/save/cancel and manual heard/content review attestation | Auto-save on generation; Switch implying a persistent setting |
| Banner, plain status, ProgressBar | Durable errors/stale warnings and reported progress | Toast-only failures or invented completion estimates |
| Native audio + native save dialog | Authorized local WAV audition and user-selected filesystem destinations | Reimplementing a player/design system or renderer-controlled paths |

Native `<audio>` is a deliberate media exception consistent with existing video.
No new control wrapper, palette/font asset or global control CSS was added. Existing
category imports/compositions were reused. CLI component/catalogue/template probes
failed because Astryx is not installed; this does not establish current package API
compatibility. Source guards and EN/VI key checks are not loaded keyboard/focus/IME,
responsive screenshot or audio-playback acceptance. See integration-0.15 evidence.
