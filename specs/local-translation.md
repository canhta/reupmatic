# Reviewed local translation — bounded 0.14 implementation

This direct-Editor slice extends SC-04-F02/05/06 and SC-05-F04/05, SCR-02,
ED-R09–11 and ED-SUB02–07. BUSINESS_SCOPE.md and specs/editor.md remain product
authority. It does not complete the speech pipeline or establish model quality.
Operational instructions and primary API references: docs/development/local-translation.md.

## Boundaries and acceptance cases

| ID | Behavior and current evidence |
| --- | --- |
| LT-01 | Select transcript or displayed text, explicit source/target language and a matching configured local pair. Capture source token, plain cues, model identity and ordered literal target rules. `tests/translation.test.mjs`, `tests/test_translation.py`. |
| LT-02 | Use native manifest selection and the existing WorkerClient/Python queue. No model download, path grant from renderer, cloud fallback, second executor or implicit rendering. `tests/test_translation_native.py`, `tests/translation-ui.test.mjs`. |
| LT-03 | Hash the bundle before/after inference, enforce file/input/token/output limits and require a complete result with original IDs/order/times. Fail the whole job rather than accept partial or truncated text. `tests/test_translation.py`, `tests/test_translation_native.py`, `tests/test_translation_contracts.py`. |
| LT-04 | Return a separate draft. Preview source, existing, generated and final text by cue identity, with source/final timings and all rows accessible in 25-row pages. Keep all existing translated cues by default; replacement is a separate whole-layer policy and confirmation. Static source checks only for rendered controls. |
| LT-05 | Source changes require a new translation request. Target-only changes may be re-reviewed without inference. Apply must match the exact preview and current document revision. No displayed/spoken text is auto-replaced. `tests/translation.test.mjs`. |
| LT-06 | Manual words/timings/extra IDs survive keep-existing; retained target language must match. Provenance records languages/model/runtime/rules/request/policy, and dependent copies become stale without losing text. One undo restores the whole document. `tests/translation.test.mjs`. |
| LT-07 | Cancellation terminates/reaps the child and frees the same queue; late or malformed progress/results cannot inject new input or overwrite the document. Temp files are removed, previous successful UI drafts survive failed retries. Native/core tests plus static hook review. |
| LT-08 | Applied translation survives project save/reopen and SQLite recovery; common composition edits map all text clocks/provenance. Project schema 5 / text layers 2 are the only current formats, without migration or reset. `tests/translation.test.mjs`, schema tests. |
| LT-09 | EN/VI controls distinguish setup missing, pair mismatch, invalid rules, stale source, replacement consequences, cancelled/failed jobs and session-only drafts. `tests/ui-library.test.mjs`, `tests/translation-ui.test.mjs`; loaded keyboard/IME/visual acceptance remains open. |

## Explicit non-goals and release gates

One local bilingual CPU/int8 OPUS-style CTranslate2/SentencePiece adapter, not a
universal model loader. Each cue is translated independently in bounded batches;
there is no cross-cue context window, model glossary, pivot language, phrase
alignment, voice synthesis, audio mixing or automatic subtitle length adjustment.
The literal rules are target-side postprocessing, not terminology conditioning.
Existing manual content is never described as generated just because its source
was reviewed; preserved content keeps the edited flag and policy provenance.

Current scope is direct editing only. Translation batch/folder/workflow recipes,
durable unapplied drafts, reusable rules, resource-aware model lifecycle and real
EN/VI/ZH model/quality/license/OS checks remain separate work. Source/native SDK
fixtures do not certify the installed app or real model. Schema changes reject old
projects intact; they do not authorize owner-data deletion or migration.
