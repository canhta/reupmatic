# Local skills review — Reupmatic 0.12

Reviewed 2026-09-16 against the supplied 0.11 archive and the 0.12 working source.
This is a repository-local review. No global skill installation or universal
agent-client auto-discovery is claimed.

## Presence, activation and preservation

| Item | Result |
| --- | --- |
| `.agents/skills/reupmatic-engineering/SKILL.md` | Present; root AGENTS explicitly activates it. Read and applied to this slice. |
| `.agents/skills/reupmatic-ui-design/SKILL.md` | Present; root AGENTS explicitly requires it before UI work. Read with its references. |
| Original high-end visual-design reference | Preserved byte-for-byte from supplied source, not rewritten as new owner guidance. |
| Desktop adaptation and UI checklist | Present, read and preserved. They distinguish desktop behavior and evidence from marketing-page recipes. |
| All local skill/reference files | Five files total, all byte-identical to 0.11; see `source-retention.json`. |
| Root instruction ownership | One root `AGENTS.md`; no nested `agent.md`, `AGENTS.md` or competing `CLAUDE.md`. |

Existing engineering adaptation documentation distinguishes selected Matt Pocock
workflows from a verbatim upstream mirror. Existing UI guidance distinguishes the
owner visual reference from Reupmatic's bilingual desktop adaptation. No change
to either skill was necessary; the current versioned review/evidence and root
integration addendum were updated instead.

## Engineering standards review

**PASS — source/native evidence:** composition owns document validation, editing,
cue mappings and dependency authorization within business-owned runtime modules.
Pure UI timeline validation does not import native filesystem code. Native IPC
resolves explicit grants; only host-registered asset IDs cross into worker media
execution. Existing coordinator, final encoder and queue are reused.

**PASS — behavior-first evidence:** initial public-interface failure is retained
in `composition-red.tap`. Later fragment-budget and duplicate-source duration
failures are retained in `review-red.tap`, followed by passing full core tests.
Native FFmpeg/Python coordinator tests are separate from controlled SDK tests.
No fake installed-library declarations were introduced to manufacture a build.

**PASS — source contracts and safeguards:** one current project schema 3; producers,
consumers, generated contracts and active fixtures updated together. No dual
reader, migration, startup deletion or silent reset. Composition edits use atomic
snapshots and stale revision checks; source bytes, grants, safe output paths and
captured render provenance are validated. All original public assets, skills and
reserved markers are retained. Source-size/entry-point/ownership guards pass.

**BLOCKED — full tooling acceptance:** genuine dependency-resolved typechecking,
Biome and Ruff did not pass in this environment. Actual errors are retained;
syntax/static checks are not substituted for those gates. See RESULTS.md.

## Separate product/specification review

The bounded hard-cut slice advances SC-02/03/05 and the mapped editing,
project/recovery/Library flows. It does not approve all proposed Editor defaults or
mark every acceptance criterion complete. The five task areas, three independent
modes, 14 scope groups and reserved unfinished modules remain represented.

Composition OCR/inpainting and batch/folder admission are explicitly unavailable,
not silently ignored. Source-clip audition is labelled differently from processed
sample playback. Timeline/captions use montage time; music uses edited-output time.
All distinct source dependencies are required on open; the initial anchor remains
required even when no longer used by a retained clip. Library association covers
known first content records, not the full deletion/derivation graph.

Remaining text/speech, download/classification, Automation/distribution, resource
and account-policy features stay in the coverage map and implementation sequence.
A marker, local post record, controlled SDK response or a static UI component is
not counted as a completed production flow.

## UI task-to-component review

Task: assemble and revise one composition without introducing another timeline,
engine or decorative dashboard. Existing neutral-dark Editorial Split direction,
shared tokens and EN/VI locale ownership are retained.

| Choice | Reason and rejected alternative |
| --- | --- |
| Astryx Collapsible | Optional composition tools stay in the Editor rather than a new onboarding wizard or screen. |
| Astryx Table | Comparable clips need order, source/ranges and an explicit selection; repeated decorative cards obscure that task. |
| Astryx NumberInput | Source milliseconds and speed are media quantities, not calendar/time-of-day fields. |
| Astryx Button / existing confirmation lifecycle | Explicit stage/apply, reload, structural commands and discard/removal consent; no lookalike primitive wrappers. |
| Astryx Banner / persistent text | Errors, unsupported AI and stale results need durable explanations rather than toast-only failures. |
| Existing specialist Timeline | Read-only clip row and shared composition clock; no custom drag subsystem or duplicated editor. |
| Native media/file picker | Deliberate exceptions for playback and local permission grants, not replacement general controls. |

Both locale dictionaries include new actions, draft/stale/limit errors, source
versus composition clock explanations and unsupported-operation messages. The
literal-message guard passes. No new font binary, arbitrary theme, global control
CSS override, animation showcase or synthetic progress/statistics were added.

### Discovery evidence, not installed-library approval

The three required Astryx CLI commands were attempted and failed because the
installed CLI dependency was absent (`astryx-cli.txt`). The inventory keeps
`packageVerified` false. Component selection is documented in
`docs/ui/astryx-component-map.md`, with official source/API research:

- https://raw.githubusercontent.com/facebook/astryx/v0.6.1/packages/core/src/Table/Table.tsx
- https://raw.githubusercontent.com/facebook/astryx/v0.6.1/packages/core/src/NumberInput/NumberInput.tsx
- https://astryx.atmeta.com/components/Button

The specialist timeline's read-only flags were checked against upstream source:
https://raw.githubusercontent.com/xzdarcy/react-timeline-editor/master/packages/engine/src/interface/action.ts
and the timeline interface source. That master-branch research is not verification
of the installed published dependency. FFmpeg concat/filter design was checked
against https://ffmpeg.org/ffmpeg-filters.html#concat; actual synthetic native tests
provide this slice's local encoding evidence. None establishes desktop UI fitness.

## UI checklist status

| Checklist area | Status |
| --- | --- |
| Real command wiring, staged/stale/empty/error states and explicit unsupported capabilities | PASS at source/core/native boundaries; loaded UI interaction NOT RUN. |
| Existing single-source cue/edit/render behavior | Regression core/native suites pass; full interactive Editor regression NOT RUN. |
| One theme, direct Astryx use, no parallel primitives, both literal locales | PASS static guardrails; actual visual/accessibility quality NOT RUN. |
| Source/original safety, cancel/retry, saved snapshot and dependency validation | Core/native tests pass; actual OS picker/recovery-dialog interaction NOT RUN. |
| Keyboard/focus, screen reader, disabled-state explanations in practice | NOT RUN in installed Electron. |
| Vietnamese IME, language switching during edits/jobs, long labels/paths | NOT RUN in installed Electron. |
| Reduced motion, enlarged text, desktop widths and rendered screenshots | NOT RUN; no screenshots fabricated. |
| Concurrent editing/batch, playback responsiveness and browser console | NOT RUN in loaded UI; native queue tests are not a responsiveness benchmark. |
| Full dependency typecheck/lint/build | BLOCKED/failed with actual logs; not passed by source inspection. |

Owner environment checks should exercise staged Apply/Reload and undo; source
versus processed preview; long EN/VI clip names; keyboard/IME; cancel or reject a
changed source during project/recovery open; close/flush recovery; caption
fragments across reordered cuts; and sample/full audio around cuts. Keep
installer/full E2E separate from the next feature implementation slice.
