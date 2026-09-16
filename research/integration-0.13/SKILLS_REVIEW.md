# Local skills review — Reupmatic 0.13

Reviewed 2026-09-16 against the supplied 0.12 archive and current source. This is
repository-local activation, not global installation or automatic discovery in
all agent clients. Both skills were inspected before their implementation tasks.

## Presence, authority and preservation

The root AGENTS.md activates `reupmatic-engineering` and `reupmatic-ui-design`.
Both SKILL.md files and the three original UI reference/adaptation/checklist files
remain byte-for-byte identical to the supplied archive. There is one root agent
instruction file and no new nested/competing instruction file. The owner visual
reference is not rewritten or represented as independently validated UX research.
See `source-retention.json` for all five file paths and preservation counts.

## Engineering standards review — source and native evidence

PASS: capabilities follow UI → typed host IPC → core/worker ownership. Independent
text commands and speech request/status validation are browser-safe. A shared
RemoteError identity now lives outside Node transport; actual rendering, batch,
folder, vision and speech callers use it without a compatibility re-export.
The runtime value-import regression and AST traversal catch the Node dependency
that review found in the first speech validator. No guessed installed-package
stubs or second renderer/queue were added.

PASS: public-interface red runs precede working text-layer and recognition slices.
Subsequent red/green cases protect reviewed manual text near the size limit and
reject array-coerced language values. Whole-document history, real project files,
SQLite recovery, stale tokens, source/model hashes, cancellation, empty results
and unchanged original media have executable evidence. Native STT integration
uses actual FFmpeg, the actual worker protocol and an actual child process, but
controlled SDK/weight doubles rather than a real recognition model.

PASS: project schema 4 is the sole current contract; canonical schemas, generated
embeddings, producers, consumers and active fixtures were updated together.
No migration, old reader, downgrade, data reset or silent schema repair exists.
Retained-path protection now covers all 769 supplied source paths and 96 markers.
A promoted boundary reduces mapped reserved declarations to 85 without deleting
any original marker. Ownership/entry-size/structure/scope/contract guards pass.

BLOCKED: dependency-resolved Electron/React/Astryx typechecking/build, Biome and
Ruff do not pass in this environment. Source syntax and core compilation are not
substitutes for these gates. The actual Node/Python versions differ from declared
targets. No claim of package installation, model execution quality or shipping
platform support follows from controlled tests.

## Separate specification and scope review

PARTIAL DELIVERY: independent source, translated, spoken and displayed text are
represented and editable, with provenance, language, explicit preview/apply,
copy invalidation and reviewed-keep-edits. Composition commands map all text
clocks consistently without regenerating independent words. The existing table
and timeline follow the selected layer; the renderer still uses displayed cues.
STT returns original-source segment timing and requires explicit transcript
replacement. Source language is independent of EN/VI interface selection.

The manifest is native-selected, local and content-hashed. Status is discovery,
not hash/model verification; actual work verifies selected bytes. Explicit
CPU/int8 recognition runs through the existing queue and cancellable child, with
original delayed-audio timing and temporary-file cleanup. The Python audit guard
is defense in depth, not an OS sandbox or authorization to run hostile weights.
No model download, paid fallback, automatic translation or voice synthesis occurs.

The full 14 scope groups, five areas, three modes, 76 feature slices and 24 flows
remain tracked. Automatic translation/TTS/alignment, multi-clip/batch speech,
durable unapplied speech drafts, complete Library derivation/deletion, online
Downloads/classification, autonomous routing/scheduling, real publishing and
resource/account/commercial policies remain incomplete. A layer name, disabled
control, schema, marker or SDK-double result does not close these requirements.
LS-AC01–10 map this bounded implementation; open Editor/product policy is unchanged.

## UI task and component review

Task: edit independent text and compare generated transcript without silently
changing the spoken/displayed result. Keep the existing neutral-dark Editorial
Split, shared tokens, full cue editor, specialist timeline and media preview.

Selector owns layer/language choices; Section owns the task group; Collapsible
contains optional setup/comparison; Table shows bounded before/after records;
Button owns explicit setup/run/cancel/review/apply. Banner and ordinary status
text explain unavailable/stale/error states. ProgressBar uses reported progress
or a truthful indeterminate state. No generic cards, parallel primitive library,
new theme/font, calendar-as-duration field or implied completed-step wizard.

Cancellation and prerequisites are visible outside optional setup. STT success
stays a draft, does not switch the active layer and does not start downstream
services. An empty result cannot erase a transcript. The whole-track replacement
consequence, including text outside a sampled interval, is stated explicitly.
Existing confirmation/revision lifecycles protect imports and document changes.
Bilingual actions, errors, origins, source-language choices and accessible labels
are present; existing literal-message/source guards pass.

The three installed Astryx discovery commands were attempted and failed because
the CLI/dependencies are absent. Existing source-reviewed category APIs are reused;
`docs/ui/astryx-component-map.md` records states, rationale and alternatives and
`astryx-inventory.json` keeps packageVerified false. This is not installed API
approval. The optional speech API is pinned to reviewed faster-whisper 1.2.1
primary sources listed in the local-speech guide, not claimed to be the latest.

## Loaded-application checklist — not executed

No loaded Electron screenshots, focus/keyboard traversal, Vietnamese IME entry,
responsive EN/VI layout, contrast/large-table performance or reduced-motion
interaction pass was performed. Actual EN/VI/ZH recognition accuracy, silence/
hallucination behavior, model/license provenance, long-run memory/throughput and
platform-specific installation/process cleanup remain separate acceptance gates.
See RESULTS.md for exact executable counts, logs and blocked commands.
