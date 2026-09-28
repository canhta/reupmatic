# Full e2e on main e031cb6 (2026-09-27)

Command: `PYTHON=$PWD/python/bin/python3 pnpm run test:e2e`. Result: 110 tests, 106 pass, 4 fail
(438 s). With the staged Python every runtime is present, so none of the failures come from the
environment.

- **speech-engine-picker (en, vi): a product bug.**
  - Cause: `LayerLanguageField` returns null once the layer has a language
    (`app/ui/features/editor/text-layers/LayerLanguageField.tsx:20`).
  - Effect: after a language is picked, the Transcribe tool has no way to change the recognition
    language. A wrong choice can only be undone by clearing the layer. The picker's slot is left as
    an empty gap (`speech-engine-picker-en-failure.png`).
  - Fix: always show the language Selector, prefilled with the current value.
- **generator-panels screenshots (en, vi): test drift.**
  - Cause: commit c6373e0 removed the `.generator-review` class. The review itself renders correctly
    (`generator-panels-en-failure.png`).
  - Fix: select the review by role or label instead of the class.
