> Current 0.14 note: translation is now implemented in a bounded reviewed slice; see
> `docs/development/local-translation.md`. Speech/text behavior below is retained;
> current project schema is 5 and text-layer version is 2. Synthesis/alignment remain open.

# Independent text and local speech — integration 0.13

Source delivery, not a certified speech model or desktop release. This slice covers
SC-04-F01/02/03/05/06 and SC-05-F01/03/04/05 in direct Editor use. Bounded
translation is added in 0.14; synthesis/alignment, speech in batch/Automation and
multi-clip recognition remain open. The existing renderer and Python queue are retained.

## Four independent text layers

Open a local video, then use **Text workspace → Editing layer**. Transcript,
translated text, spoken text and displayed subtitles have separate cue content,
timing, declared language, origin, edit token and stale state. The table and
specialist timeline edit the selected layer. The media preview and video renderer
always use displayed subtitles, never the currently selected non-display layer.
Only displayed cues contain visual styles; there is one canonical displayed array.

Typing, adding/deleting/splitting/merging cues, bulk timing, regex rules, SRT import
and subtitle-file export target the selected layer. Language labels are metadata,
not translation. The interface language does not change source language or text.
ASS exports of non-display layers use ordinary default presentation, not voice
alignment; SRT is the simplest interchange. Output-clock export applies the same
global trim/speed mapping as displayed subtitles without modifying the document.

**Copy from another layer** previews a whole-layer replacement. Applying is a
separate, revision/token-checked action. Copying transcript to translated does not
translate it; copying into spoken does not generate sound. Editing an upstream
copy source marks its dependent copies stale without replacing their words. Pure
subtitle appearance changes do not invalidate spoken text. To retain a manually
corrected stale copy, select its actual source and preview the comparison, then
choose **Keep my edits; source reviewed**. That explicit acknowledgement keeps
its text/timing, updates its source reference and leaves descendants needing their
own review. A stale source must itself be reviewed first.

Each operation is one whole-document undo/redo entry. Composition trim, speed,
reorder, split, join and removal apply the same clock mapping to all layers while
retaining independent words. Copied dependencies are rebased with that common
clock change rather than falsely marked text-regeneration work. Clip removal can
remove cues attached to that footage; ordinary Undo restores them.

Applied layers persist in project **schema 5** and existing autosave/recovery.
Older project schemas, including schema 4 from 0.13, fail explicitly and are not
migrated or silently rewritten. Original media and old archives remain separate.
Copy previews and unapplied STT results are session drafts, not durable recovery
records; apply/save the transcript before replacing the current document.

## Optional runtime, explicit installation

The adapter targets the reviewed **faster-whisper 1.2.1** API. It uses CTranslate2
CPU/int8 with two CPU threads and one model worker. This is an adapter target,
not a claim of the latest release, an installed dependency lock, throughput, or
Python/platform compatibility. The archive contains no weights or downloaded
runtime. Installing the optional stack is a separate owner action, for example in
the worker's chosen virtual environment:

```sh
python -m pip install -r worker/requirements-speech.txt
```

This command may access package registries; the application never runs it for you.
Review actual wheels, transitive versions, hardware support and licenses before
using that environment. Keep the installed runtime provenance with recognition
results. Baseline subtitle parsing still independently needs pysubs2. STT execution
itself does not require pysubs2.

Reviewed primary API sources (not real-model quality evidence):

- https://github.com/SYSTRAN/faster-whisper/releases/tag/v1.2.1
- https://github.com/SYSTRAN/faster-whisper/blob/v1.2.1/faster_whisper/transcribe.py
- https://github.com/SYSTRAN/faster-whisper/blob/v1.2.1/requirements.txt
- https://opennmt.net/CTranslate2/quantization.html

## Prepare a local manifest

Use a trusted, already acquired CTranslate2-compatible model directory. Review
upstream code, original weights, converted weights and tokenizer licenses/provenance
separately. SHA-256 matching detects changes relative to the selected manifest; it
does not establish that a model is safe, licensed or accurate.

Required files: `model.bin`, `config.json`, `tokenizer.json`, and at least one of
`vocabulary.json` or `vocabulary.txt`. Include `preprocessor_config.json` when
present. A recognized runtime file present but omitted from the manifest is
rejected, and a symlink escaping the model directory is rejected. Each selected
file must be nonempty; model.bin is limited to 4 GiB and other files to 16 MiB.

A template follows. Placeholders are intentionally invalid and must be replaced
with the hashes of your actual files; this is not a preconfigured model.

```json
{
  "version": 1,
  "engine": "faster-whisper",
  "directory": "./local-model",
  "languages": ["en", "vi", "zh"],
  "files": {
    "config.json": "REPLACE_WITH_SHA256",
    "model.bin": "REPLACE_WITH_SHA256",
    "tokenizer.json": "REPLACE_WITH_SHA256",
    "vocabulary.json": "REPLACE_WITH_SHA256"
  }
}
```

Declare only languages actually supported by the bundle. This build exposes en,
vi and zh; this is not a statement that every model supports or accurately handles
all three. Non-English requests against an English-only recognizer are explicitly
refused. No automatic language or alternative model is selected on failure.

Relative paths resolve against the chosen manifest's directory. URLs and network
share syntax are rejected. In **Editor → Local speech recognition → Local model
setup**, choose the prepared JSON through the native picker. The existing queue
validates every hash and atomically writes normalized local configuration to
`integration-workspace/local-speech.json` under Electron user data. It does not
copy weights, install libraries, infer speech or render video. Cancellation before
commit or a failed check keeps the previous configuration. A cancellation racing
an already completed atomic commit cannot roll it back; the UI refreshes actual
saved status after the operation, including failure/cancellation.

Status is a lightweight local file/runtime inspection, always `verified: false`;
it does not load weights or rehash them on navigation. Every actual recognition
request checks the model identity and file hashes, including checks within the
child before and after inference. Runtime import/inference can still fail even
when discovery finds the package modules.

## Explicit recognition and review

Choose the **language spoken in the source**, independent of UI locale. Select
current sample range or the entire original video, then press **Recognize speech**.
Each request is limited to two hours. Full video beyond that limit is rejected;
use a shorter sample. The sample range is the original source start/end shared
with Render controls, not a sped-up/cropped output clock. A multi-clip composition
cannot be recognized directly in this slice; recognize before starting composition.

FFmpeg decodes the original first audio stream to mono 16 kHz PCM. Delayed source
audio is padded before range trimming so timestamps retain the original clock.
Existing soundtrack replacements, global speed and mute do not change what STT
hears. Videos with no audio stream return a specific error. Additional language
streams are not selected automatically.

Inference runs in one cancellable child through the same worker queue as render,
OCR and other jobs. It returns source-clock **segment** timestamps, Unicode text,
source hash, model fingerprint, language and actual runtime package versions.
There is no word alignment, speaker identification, punctuation editor, translation
or TTS here. Empty recognition is valid, not fabricated text. It never auto-clears
an existing transcript.

Results remain separate until **Replace transcript**. The action replaces the
entire transcript, including text outside a sampled interval, rather than silently
merging unrelated segment IDs. The UI states this consequence before applying.
All other layers retain content; derived copies may become stale. If the document
changed since the request, use **Review against current transcript**, compare again,
then apply separately. Late results never switch the selected layer or run TTS.

Workspace space is checked before PCM extraction (PCM size plus a 64 MiB reserve).
Temporary audio/job/progress/result files are removed on success, failure and
cancellation. Sources are rehashed before and after recognition. Cancellation reaps
the inference child and releases the shared queue. Python-level audit hooks deny
network/child execution inside local inference, together with offline environment
flags and mandatory local tokenizer files. This is defense in depth, **not an
operating-system sandbox for hostile native code**; only use trusted dependencies.

## Evidence and remaining acceptance

`tests/text-layers.test.mjs` checks independence, stale previews, manual review,
whole-document undo, composition clock mapping and schema-4 roundtrips.
`tests/speech.test.mjs` checks contracts, correlation, cancellation and browser-safe
validation dependencies. `tests/test_speech*.py` check manifests, timestamps,
contracts, real FFmpeg delayed audio and real worker/child cancellation. The native
inference tests use explicitly controlled SDK/weight doubles in temporary test
directories. They do **not** establish real recognition quality or wheel compatibility.

The installed desktop, keyboard/IME, large cue-table responsiveness, real EN/VI/ZH
speech accuracy, silence/hallucinations, long-duration memory/throughput, OS-specific
model cleanup and final aligned voice output remain acceptance gates. See the
versioned RESULTS and SKILLS_REVIEW files rather than inferring a release from UI
source or controlled adapter tests.
