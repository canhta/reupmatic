# 0.15 project skills and design review

## Activation and preservation

Read root AGENTS.md, BUSINESS_SCOPE.md, relevant editor/speech/translation specs,
system map, scope coverage and implementation sequence before continuation. Root
AGENTS activates the project-local `reupmatic-engineering` and
`reupmatic-ui-design` skills. Read both, the original visual reference, desktop
adaptation, delivery checklist, Astryx task map and observed inventory. These five
skill/reference files are unchanged from supplied 0.14; there is no nested competing
AGENTS/CLAUDE instruction, global skill installation or universal-discovery claim.

## Engineering standards review

**PASS at bounded source/behavior level:** speech request/review contracts stay
browser-safe; host/core own native authority and verified artifact admission; the
Python worker owns local model execution. Synthesis reuses the existing queue,
WorkerClient and ProcessRunner. No parallel scheduler, cloud fallback, downloader,
voice-cloning interface, model placeholder in production or extra settings area
was added. Controlled model/SDK fixtures remain in tests only.

Behavior-first evidence includes initial missing-module red tests, then passing
request/result/source-review behavior; a failing model-file overwrite case followed
by guarded saves; and near-zero floats that quantized to silent PCM, now rejected.
The early manifest-tool test assumed language-array order did not affect identity;
it was corrected to compare equivalent declared manifests, not weaken runtime
validation. Red logs remain next to corrected runs.

Contracts enforce immutable spoken capture, request/revision/source correlation,
strict per-cue/token/audio limits and explicit model/voice/language admission.
Worker tests exercise cancellation/reaping, queue recovery, model mutation, network
and child-process audit denial, malformed audio and scratch cleanup. Host/native
bridge tests cover real TS/Python transport, actual PCM/receipt bytes and range
responses using controlled inference. Export guards protect imported originals,
model configuration/presets and live artifacts, including hardlinks. Native save
choices are opaque, single-use and expiring; source is rechecked after dialogs.

Architecture/file-size/entry-point guards pass. Electron main is 168 lines; synthesis
modules remain below the 450-line cap. Model/output lifetime is owned in the speech
capability, not a catch-all utility. The manifest helper shares existing registry
validation/hashing instead of creating a second model parser. No project schema
change, migration/reset or old/new parallel document reader was introduced.

## Specification compliance review

SC-04-F03/05/06 and SC-05-F05, with partial FLOW-08/22, now include natural speech
WAV/receipt generation, review and native export. Project schema 5/text layers 2
stay unchanged. Spoken text, translated text, displayed subtitles, soundtrack,
video and history are not edited by synthesis. UI content language is independent
from interface locale. The VI/EN declaration is not a forced accent parameter.

**Remaining:** segment alignment, rate/pause correction, full-duration mixing,
durable speech DAG/recovery and Library/project/batch/Automation audio admission.
Session draft state is not persisted or restored from cached files. Real SDK/model,
voice authorization/licensing, language completeness/pronunciation, resource and
installed UI acceptance remain open. No quality score or system-completion claim.

All 893 previous source paths are retained. All 12 public assets, five skill/reference
files and 96 markers are unchanged. The synthesis runtime is now marked implemented
in the partial speech module; its original marker remains preserved. Five areas,
three modes, 14 scope groups, 76 features and 24 flows remain mapped.

## Astryx selection and exceptions

Selected Section for one task region; Selector for scope/language/preset choices;
Collapsible for optional model details; Table for paginated captured words and
source/actual duration comparison; Button for explicit run/listen/save/cancel;
CheckboxInput for human review attestation; Banner/plain status/ProgressBar for
persistent errors, stale state and real work. Alternatives and rationale are in
`docs/ui/astryx-component-map.md`. No primitive wrappers or additional design system.

Native audio and native file dialogs are intentional specialist exceptions. There
are no new palette/font assets, gratuitous animation, fabricated progress or auto
render/generation on navigation. Ordinary workspace navigation follows the existing
mounted Editor; document replacement cancels transient work. Runtime navigation is
not independently verified by source reading.

Installed CLI component-list, Selector, template-list and docs commands were
attempted and failed MODULE_NOT_FOUND. Guessed upstream documentation pages were
not retrievable. Existing repository-reviewed category imports/compositions were
reused; this is not a fresh installed API certification. No fabricated package
stubs were created to make a UI check appear green.

## Checklist status

| Gate | Result |
| --- | --- |
| Captured source, limits, stale/cancel/failure and output preservation | PASS for tested core/worker/native contracts. Native Electron dialogs themselves are source-only. |
| Explicit task actions, draft review and EN/VI keys | PASS source guards; complete loaded state transitions remain NOT RUN. |
| Layout, task hierarchy, neutral theme and media exception | Source reviewed; responsive/enlarged-text screenshots NOT RUN. |
| Focus, keyboard, screen reader and Vietnamese IME | NOT RUN in installed Electron. Semantic labels/library usage do not establish acceptance. |
| Playback under load, long text, locale switching and reduced motion | NOT RUN in the actual UI. No new animation subsystem. |
| Core compiler | PASS with available real TypeScript 5.8.3 / Node types; not target TS7/Node24. |
| Full typecheck/build, Biome/Ruff | BLOCKED by missing dependencies/tools, with actual logs retained. |
| Real SDK/weights/voices and target OS release | NOT RUN; controlled sine-wave fixtures are not real speech evidence. |

Skills were checked and applied to this increment, not replaced or labeled globally
installed. The whole product remains unfinished; the next bounded source increment
is 0.16 timing/alignment and explicit voice integration.
