> Current 0.14 note: translation is now implemented in a bounded reviewed slice; see
> `docs/development/local-translation.md`. Speech/text behavior below is retained;
> current project schema is 5 and text-layer version is 2. Synthesis/alignment remain open.

# Local speech and independent text — bounded 0.13 implementation

Implements a direct-Editor slice of SC-04/05, ED-R09–11 and ED-SUB02–07. It does
not settle outstanding commercial policy, all ED-Q questions or speech in batch /
Automation. Follow root AGENTS.md, BUSINESS_SCOPE.md and specs/editor.md first.
Operational details and API sources: `docs/development/local-speech.md`.

## Current boundaries

- Four independently editable timed layers: transcript, translated, spoken and
  displayed. The canonical displayed cues remain `EditorSnapshot.cues`; other
  layers contain plain cues and all four have explicit language/provenance/token /
  edited/stale metadata. Project format is schema 5, with only one current reader.
- The selected-layer table and timeline share cue data. Import, rules, bulk timing
  and subtitle-file export use that selected layer. Media preview/render uses
  displayed cues only. The UI locale never chooses content language or runs work.
- Explicit copy preview/apply replaces a whole target layer. Upstream changes
  mark dependent copies stale without regenerating words. Manual-review apply
  preserves target words/timing, updates its reviewed source reference and keeps
  descendant invalidation visible. Appearance-only edits never regenerate voice.
- One atomic document history/recovery owns layers, composition, ranges, music
  and style. Existing composition clock changes map all layers while retaining
  independent words and valid copy relationships.
- STT requests authorize one original video ID, source hash, explicit en/vi/zh,
  exact model identity and source range. At most two hours, one first audio stream,
  CPU/int8, segment times. No multi-clip/audio-replacement/translation/TTS fallback.
- Native model manifest selection is an explicit, hash-checked configuration
  transaction, not model procurement. Status checks never infer or install.
- Shared worker execution returns a separate draft. Applying is transcript-only,
  whole-track, revision-checked and undoable. A stale draft can be explicitly
  re-reviewed against the current document before a separate apply. Unapplied
  drafts are session-only; applied results retain source/model/runtime provenance.

## Acceptance checks

| ID | Required behavior | Evidence / remaining gate |
| --- | --- | --- |
| LS-AC01 | Display/spoken/translated/transcript edits remain independent; no implicit inference | Core layer tests, source UI wiring; installed interactions pending |
| LS-AC02 | Copy/rules/import identify target; stale preview cannot overwrite edits | Core tests and existing isolated regex worker; IME/visual pending |
| LS-AC03 | Dependency invalidation retains manual words; explicit review can keep them | Core tests, reviewed-source tokens, one document undo |
| LS-AC04 | Current project/recovery retains all layers and rejects old format | Core/schema tests; owner crash/desktop reopen acceptance pending |
| LS-AC05 | Local setup requires explicit manifest, strict hashes/languages and no auto download | Python registry/configuration and native controlled tests |
| LS-AC06 | Source-clock segment results, including late audio, are bounded and correlated | Real FFmpeg plus controlled SDK/worker tests; actual model speech pending |
| LS-AC07 | Cancel reaps inference child, removes scratch and permits the next queued item | Real subprocess/worker tests, controlled recognizer; target OS pending |
| LS-AC08 | Empty/failing/no-audio/wrong-language/changed-model results preserve edits | Core/Python tests and explicit UI states |
| LS-AC09 | Recognition result never changes another layer or selected track automatically | Transcript-only apply source and revision guards; desktop E2E pending |
| LS-AC10 | Table/timeline use chosen layer, video render uses displayed layer | Source guard and existing renderer tests; installed visual acceptance pending |

Real-model quality, terminology, accurate punctuation, speaker/word alignment,
translation, synthesis, voice duration policy, durable unapplied evidence, speech
recipes for batch/folders, and dependency/license/installer readiness remain open.
