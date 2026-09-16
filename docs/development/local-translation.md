# Local translation and reviewed application — integration 0.14

This is a source integration, not a validated desktop/model release. It adds a
bounded local translation adapter to the four-layer editor delivered in 0.13.
See `specs/local-translation.md` and `research/integration-0.14/RESULTS.md` for
acceptance coverage and actual test limitations.

## Use the existing Editor

Open a video/project and prepare an independent transcript or displayed-subtitle
layer. Under **Local translation**, choose that source and explicit EN/VI/ZH
language direction. UI language is independent. A declared source language must
match; only a configured bundle for the selected direction can run. A source
already dependent on translated text is rejected to avoid circular provenance.

Optional **Literal replacements after translation** run in their displayed
order, are case sensitive, and operate only on generated target text. They are
not regex, a model glossary or context-aware terminology constraints. Up to 50
rules, 256 UTF-16 code units per field; find text must not be blank. An empty
replacement deletes matching text. Empty resulting cues or excessive expansion
fail the whole job. Existing manual translated cues are never processed by these
rules during keep-existing application. Rules used by a successful result are
captured in its draft and persisted provenance, not retroactively changed by
editing the form.

**Create translation draft** is the only inference action. Review its captured
settings, then choose **Review against current translated text**. The comparison
uses cue IDs, not row alignment; all source/extra target rows are accessible in
25-row pages. It shows source, existing, generated and final text plus final
mappings of timestamps. A generated segment retains its source ID and start/end.
This retains clocks; it does not make translated speech fit the available time.

Default **Keep all existing translated cues** retains every existing word, manual
time adjustment and extra ID; only absent IDs are added from the new result.
Existing nonempty target text must already declare the requested target language.
Unspecified/different target language requires checking its metadata or explicitly
choosing whole-layer replacement. This is deliberately conservative, not an
automatic refresh of previously generated cues.

**Replace the whole translated layer** removes all old translated cues and uses
the complete generated result. The UI requires a separate checkbox confirmation
when existing text would be replaced. Applying is a distinct action and one
whole-document undo/redo change. Spoken text and displayed subtitles retain their
words/timings; downstream references may become stale. Copying reviewed translated
text into those layers is a separate existing preview/apply action, never automatic.

Source content, language or timing changes after request capture invalidate the
result for application: create a new request. Target-only changes allow a fresh
comparison without rerunning inference. Editing the document after a comparison
invalidates its apply button and core snapshot check. Common composition cuts and
speed changes rebase the clocks/provenance of already applied translations;
unfinished drafts cannot be silently rebased. Upstream source edits mark applied
translations and dependent copies stale. Existing **Keep my edits; source reviewed**
can acknowledge a current source without changing manual words or losing model
provenance; descendants still require their own review.

Drafts survive ordinary workspace navigation while the document remains mounted.
They are session-only: apply/save before closing/replacing the document. Applied
layers and provenance persist through project save/reopen and existing SQLite
recovery. **Project schema 5 and text-layer version 2 are the sole current readers.**
Schema 4/older projects and text-layer version 1 are rejected intact. There is no
migration, reset, downgrade or silent owner-file rewrite. Keep the original ZIPs
and media.

## Install an optional runtime explicitly

The adapter targets **CTranslate2 4.6.0** and **SentencePiece 0.2.1**, not a claim
that these are the latest packages or a verified installed/transitive lock. The
source archive contains no SDK, model weights or fonts. In the chosen worker
virtual environment, installation is a separate owner action:

```sh
python -m pip install -r worker/requirements-translation.txt
```

This command can contact package registries; the app does not execute it. Review
Python/OS wheels, CPU instruction support, dependency provenance and licenses
before installation. Optional STT remains separate, but uses the same worker
process/queue. No translation fallback uses faster-whisper or cloud services.

Primary APIs inspected for this adapter:

- https://github.com/OpenNMT/CTranslate2/blob/v4.6.0/python/cpp/translator.cc
- https://github.com/OpenNMT/CTranslate2/blob/v4.6.0/python/ctranslate2/converters/opus_mt.py
- https://opennmt.net/CTranslate2/guides/opus_mt.html
- https://github.com/google/sentencepiece/blob/v0.2.1/python/README.md

The implementation uses source SentencePiece `encode(..., out_type=str)`, target
`decode(...)`, and CTranslate2 `Translator.translate_batch`. CPU/int8, one model
worker, two intra-op threads, beam size 4, one hypothesis and batches of at most
eight cues are explicit. Source truncation is disabled with `max_input_length=0`;
source segments over 512 tokens are rejected. Generated segments must end with
`</s>` within the 512-token decoding limit. No EOS means the entire job fails,
not that a partial result is accepted. Those API observations are not quality,
throughput, native-memory or model-compatibility evidence.

## Prepare a trusted local bilingual bundle

Use already acquired and reviewed OPUS-style CTranslate2 encoder-decoder weights,
matching source/target SentencePiece models, vocabulary files, and standard
`</s>` EOS. Multilingual models needing language prefixes, special token handling,
non-SentencePiece tokenizers, LLM prompting or another EOS are **not supported by
this adapter**. Merely setting a language code does not make a model bilingual.
Test the actual prepared pair independently; model quality was not tested in
this source handoff. Check original and converted model/tokenizer licenses.

Required: `model.bin`, `config.json`, `source.spm`, `target.spm`, plus exactly one
vocabulary layout: `shared_vocabulary.json`, or both `source_vocabulary.json` and
`target_vocabulary.json`. If `vmap.txt` exists it must be listed/hashed too, although
this adapter does not enable vocabulary restriction. All recognized runtime files
must be listed. Symlinked model files are rejected. Files must be nonempty, with
model.bin at most 4 GiB and ancillary files at most 16 MiB each.

Example manifest (placeholders are intentionally invalid; replace with actual
SHA-256 values). Relative directory paths resolve against the selected manifest.

```json
{
  "version": 1,
  "engine": "ctranslate2-sentencepiece",
  "directory": "./bilingual-model",
  "source_language": "en",
  "target_language": "vi",
  "files": {
    "model.bin": "REPLACE_WITH_SHA256",
    "config.json": "REPLACE_WITH_SHA256",
    "source.spm": "REPLACE_WITH_SHA256",
    "target.spm": "REPLACE_WITH_SHA256",
    "shared_vocabulary.json": "REPLACE_WITH_SHA256"
  }
}
```

Choose it via the native **Local translation model setup** picker. Hashing and
atomic normalized configuration publication use the existing queue. Failed or
cancelled validation leaves the previous configuration intact. Cancellation after
an atomic commit cannot undo that commit; the host refreshes capability state.
Weights stay in place; only the normalized manifest is stored in the workspace
as `local-translation.json`. URLs/UNC syntax are rejected. Relative paths may be
resolved locally; mount provenance is the owner's responsibility.

Capability discovery checks file layout and package discoverability but does not
load weights or hash them. It always returns `verified: false`. Every actual job
rehashes the configured bundle, checks the captured pair/identity, executes in a
cancellable child, and rechecks file hashes before publishing. The identity covers
the engine, pair, hashes and adapter/device mode. Runtime versions are attached
to results. Hash matching proves identity relative to the chosen manifest, not
trustworthiness, licensing or translation correctness.

## Limits and failure behavior

At most 500 nonempty cues, 4,000 UTF-16 units/cue and 100,000 UTF-8 source-text
bytes per request; 511,000 bytes of compact parameter JSON and 512,000 public
request bytes. Rules and IDs are also bounded. Each generated cue is limited to
10,000 UTF-16 units and complete responses to 1,000,000 bytes. The project has an
independent supplemental-layer budget, so a valid draft may still be too large
to apply; existing text is retained on failure. A job needs 16 MiB free workspace
space and has a one-hour timeout. These are bounds, not resource-aware scheduling
or assurances that every allowed model fits available RAM.

Cancellation terminates/reaps the inference child through the existing process
runner, removes temporary request/progress/result files and releases the same
queue. No original media or subtitle file is written. Correlated results preserve
all segment IDs/order/times; mismatches, blank output, model changes, missing EOS,
invalid rules or runtime failure reject the entire result. Existing text and a
previous successful UI draft are retained on a failed retry. Python network/child
process audit guards are defense in depth, not an OS sandbox for hostile native
libraries. Only trusted local runtimes/models should be loaded.

Still open: real model/language acceptance, full Electron/EN/VI/IME/focus checks,
TTS/alignment/mixing, batch and Automation translation stages, persistent rule
presets and unapplied drafts, model lifecycle/resource budgets and installers.
