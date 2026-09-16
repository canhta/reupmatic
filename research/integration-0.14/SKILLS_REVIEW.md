# 0.14 project-skills and design review

## Activation and preserved references

Read the single root `AGENTS.md`, BUSINESS_SCOPE.md, editor/local-speech specs,
system/source maps, scope coverage and implementation sequence before continuing.
Root AGENTS activates both project-local skills:

- `.agents/skills/reupmatic-engineering/SKILL.md`
- `.agents/skills/reupmatic-ui-design/SKILL.md`

Also read the original high-end visual reference, desktop adaptation and delivery
review checklist. All five skill/reference files remain byte-for-byte identical
to the supplied 0.13 archive. These are local project skills, not global tools or
an assertion of automatic discovery in every agent client. The original reference
is not copied into a conflicting replacement or converted into an aesthetic score.

## Engineering standards pass

**Implemented/source-reviewed:** browser-safe translation request/rules/review
modules; a separate Node coordinator on the existing worker port; native model
selection and typed preload/IPC; Python-owned bundle hashing, local inference and
cancellation; reuse of the existing queue. Atomic child JSON publication is now
shared by actual STT and translation callers, rather than duplicated. No parallel
scheduler, translator mock in production, automatic download or hidden paid/cloud
fallback was added. Native tests substitute controlled SDK/model fixtures only.

Initial red evidence is preserved for missing public translation modules/worker
imports, followed by executable contract/review/native tests. Final core tests
cover manual words/times/extras, explicit replacement, stale/tampered snapshots,
provenance, cycles, source/target languages, cancellation, malformed progress,
undo/redo, actual project/SQLite persistence, displayed-source presentation
independence and common composition-clock remapping. Worker tests cover input and
rule limits, model identities/paths/hashes, cancellation, queue release, offline
audit denial, partial/truncated output, model mutation and temp cleanup.

Handwritten source size and entry-point guards pass. Electron main is 166 lines;
new app/worker translation modules are well below the 450-line ceiling. No Node
value import leaks through the renderer-facing translation graph. Current project
schema 5 / text layers 2 replace older readers; no migration/reset or deprecated
review alias is retained. All 839 original source paths are protected, including
96 markers. Promoted worker translation keeps its original marker. Five task
areas, three modes, 14 scope groups, 76 feature rows and 24 flows remain mapped.

**Specification pass:** LT-01–09 are traced in specs/local-translation.md. The
slice is direct-Editor only. Translating changes no layer until explicit review /
application; keep-existing is deliberately conservative. Applied provenance keeps
languages, request, model, runtime, literal rules and policy. Standard source time
retention is not voice fitting. Cross-cue context, model glossary, synthesis,
alignment, batch/Automation speech and persistent unapplied drafts remain gaps.

## Astryx selection and API review

Read the task-to-component map and observed inventory. Three installed CLI
attempts were blocked by the missing package; `astryx-discovery.txt` records the
actual errors. No npm installation or fabricated package declarations were used.
Pinned upstream 0.6.1 CheckboxInput, RadioList and TextInput source signatures were
inspected. An initial guessed upstream path returned 404; the actual package-root
component paths were then retrieved. CheckboxInput uses `value/onChange`, not a
native `checked` prop. Sources and rationale are in docs/ui/astryx-component-map.md.
`packageVerified` remains false: upstream source review is not installed typecheck.

Task choices: Selector for source/direction; Collapsible for optional setup/rules;
RadioList for consequences visible before review; CheckboxInput for destructive
replacement acknowledgement; Table for cue-ID comparisons with all-page access;
ProgressBar and Banner for truthful status/errors; existing Section/Button/TextInput
for actions/fields. No card-per-cue redesign, custom control kit, raw form primitives,
new palette, arbitrary animation or font binary was added. Existing neutral-dark
Editorial Split, timeline, video and waveform owners are retained.

## UI checklist — scope of evidence

| Review area | Evidence and status |
| --- | --- |
| Task, states and source wiring | PASS at source/static level: empty source, matching configured pair, explicit start/review/apply/cancel, missing runtime/model, stale and replacement states are present. |
| Preservation and navigation | PASS core/native plus source-hook review: manual data preserved; document remount cancels/drops transient draft; ordinary workspace navigation leaves document-mounted jobs/drafts. Actual rendered navigation remains NOT RUN. |
| Bilingual labels and errors | PASS source guards for literal keys and translation-specific dynamic keys in EN/VI. This does not certify linguistic quality or real IME interaction. |
| Layout, hierarchy and tokens | Source reuse reviewed; actual responsive screenshots, enlarged text and populated/empty/error visual states NOT RUN. |
| Keyboard, focus, screen reader, IME | NOT RUN in loaded Electron. Library primitives and labels are not proof of acceptance. |
| Playback/editing under load and motion | No new animation/render-on-keystroke path introduced; loaded performance, focus and reduced-motion acceptance NOT RUN. |
| Type/lint/build | Core compiles with available real tools. Dependency-resolved app typecheck/build and Biome/Ruff are BLOCKED; see RESULTS.md. |

## Open gates

No actual translation model/SDK was installed or quality-tested. Controlled native
process tests establish integration/failure behavior, not semantic accuracy, timing
fit, resource budget, model safety or license approval. Target Node 24/TypeScript 7,
real dependency lock, desktop builds/E2E, Windows/macOS packaging, signing, keyboard /
IME/visual and real-language model acceptance remain separate owner gates. The
skills are active and reviewed; the whole system is not finalized.
