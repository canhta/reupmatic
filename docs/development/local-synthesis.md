# Local spoken-layer synthesis — 0.15

This source slice makes reviewable natural speech artifacts. It does not fit voice
to video time, alter displayed captions, mix audio, create a durable workflow stage
or prove production readiness. See `specs/local-synthesis.md` and versioned evidence.

## 1. Runtime and trust boundary

Use an isolated project Python environment. Optional SDK installation is an explicit
developer action, not an application side effect:

```sh
python -m pip install -r worker/requirements-synthesis.txt
```

The reviewed boundary is **vieneu 3.7.1**, not an assertion that it is the latest
version. Reupmatic uses the version-specific `OnnxV3LiteEngine` implementation,
with explicit local model and codec directories, CPU execution and two inference
threads. This internal SDK API is version-pinned and needs actual-runtime acceptance
before release. The integration environment did not install it or run real weights.
Transitive SDK dependencies are not a resolved reproducible runtime lock.

The manifest declares a trusted compatible FP32 export; file hashes pin content,
not its internal graph precision, absence of malicious behavior, voice rights or
model/license suitability. Do not admit untrusted ONNX/NPZ graphs. Offline flags
and Python audit checks are defense in depth, not native-library or OS isolation.
No cloning or reference-audio enrollment is exposed. Only existing authorized
numeric voice presets are accepted. Never bundle real private presets or weights
in the source release.

## 2. Prepare an existing model bundle

Prepare the following exact directory layout using independently obtained,
authorized, matching export files. This handoff contains no working model bundle.
The application will not acquire missing files.

```text
speech-bundle/
  onnx/
    vieneu_prefill.onnx
    vieneu_decode_step.onnx
    vieneu_acoustic_cached.onnx
    vieneu_backbone_shared.data
    vieneu_v3_heads.npz
    config.json
    tokenizer.json
  codec/
    moss_audio_tokenizer_decode_full.onnx
    moss_audio_tokenizer_decode_shared.data
  voices.json
```

No extra files or symlinks are allowed in that runtime bundle. Keep the manifest,
license/provenance records and other distribution assets outside it. Preserve those
records separately; this strict runtime subset is not permission to discard notices.

`voices.json` has the exact shape `{ "version": 1, "voices": [...] }`. Each entry
has `id`, `label`, `speaker_emb` and `ref_codes`. IDs are unique; 1–100 presets,
file size at most 2 MiB. `speaker_emb` is 192 finite numeric values, not all zero;
`ref_codes` has 1–500 equally sized rows of 1–32 integers between 0 and 65535.
At execution, row width must match the loaded model's `n_vq`. The adapter validates
shape, not the semantic quality of a preset. Derivation/export of a valid authorized
preset is outside this slice; a label and arbitrary zeros cannot stand in for one.

Generate the manifest from already prepared files using the included helper:

```sh
python scripts/synthesis_manifest.py \
  --directory /absolute/path/to/speech-bundle \
  --output /absolute/path/to/speech-manifest.json --languages vi en
```

The helper validates the bundle shape and presets, hashes all required files and
creates a new manifest outside the bundle. It refuses to overwrite an existing
manifest. This is local hashing, not model download or synthesis. Manifest keys:
`version: 1`, `engine: "vieneu-v3-turbo-onnx"`, `directory`, `languages`, `files`.
`files` maps every relative filename above to its lower-case SHA-256 digest.
Model identity also binds the adapter/SDK/CPU/FP32 declaration. A relocation with
unchanged content retains identity. The application's native picker also accepts
manifests with a relative directory, resolved against the manifest's parent.

## 3. Explicit editor workflow

Open a video in the existing Editor. Select the spoken layer, edit its words/clocks
or explicitly copy/review another layer, and resolve stale inherited text. Choose
one selected spoken cue or all spoken cues. Open local speech setup, select the
manifest with the native dialog, then explicitly choose a configured preset and
VI/EN content declaration. Availability is not a model-quality test.

Select Generate. The shared worker returns a separate draft; no other layer,
soundtrack, render, profile, Library record or video changes. Compare captured
words, source clock and actual audio frame spans/durations. Open the verified local
audio preview and listen. Check the review box only after checking omissions,
pronunciation and the intended content. Save WAV and, separately, its JSON receipt
through native dialogs. The source is rechecked after a dialog closes; source
changes require a new generation. Native save protects imported originals and
admitted model/output files; it does not claim to protect every arbitrary file on
the user's machine or every concurrent external filesystem mutation.

The VI/EN control declares/admit-checks content language. The pinned SDK uses a
bilingual normalizer; Reupmatic does not invent a provider language parameter or
promise a forced English accent. UI locale never selects the content language.

## 4. Limits, lifetime and failure recovery

Requests allow 100 nonempty cues, 300 UTF-16 units per cue, 20 kB UTF-8 text and the
public IPC byte bounds. Long phonemized inputs over 512 tokens fail. Audio is
natural sequential mono PCM16 at 48 kHz with 250 ms gaps, each cue under 60 seconds,
total at most 600 seconds. Source clocks are receipt metadata, not silence/padding
or alignment instructions. Fixed adapter sampling is not deterministic quality
or voice consistency evidence.

The provider returns waveform without a reliable EOS/completion signal. Hard
limits, nonempty/finite checks and nonsilence detection cannot certify linguistic
completeness; manual audition remains essential. No text or waveform is shortened
to pass a size limit. Output may still omit or mispronounce words.

Cancel terminates/reaps the inference child and removes scratch; queue work after
a failure remains usable. Failed setup preserves the prior saved model configuration.
Failed/cancelled regeneration retains the previous draft. Changed spoken text,
clocks, language or stale source invalidates audio review/save, not unrelated
caption-style edits. Model changes, bad hashes, invalid presets, missing runtime,
unsupported SDK, token/output bounds and full disk fail explicitly.

Draft/review grants are in-memory and disappear on document/session replacement.
The workspace speech cache is not a project/recovery database; files are not
rediscovered on restart and there is no automatic cache cleanup feature here.
Session admission is capped at 256 artifacts. Save outputs before leaving. Each
WAV/receipt native save is atomic independently, not a paired transaction. The
receipt includes captured private words, source token/times, model/voice, language,
SDK runtime, frame spans and audio hash; it contains no native source/model paths.

## 5. Reviewed primary sources and release gates

Sources inspected on 2026-09-16; these inform the narrow pinned boundary, not
proof that the release has run it:

- Pinned engine: https://raw.githubusercontent.com/pnnbao97/VieNeu-TTS/v3.7.1/src/vieneu/_v3_turbo_engine/onnx_runtime_lite.py
- Pinned normalizer: https://raw.githubusercontent.com/pnnbao97/VieNeu-TTS/v3.7.1/src/vieneu_utils/phonemize_text.py
- Pinned high-level adapter: https://raw.githubusercontent.com/pnnbao97/VieNeu-TTS/v3.7.1/src/vieneu/v3turbo.py
- Release metadata: https://pypi.org/pypi/vieneu/3.7.1/json

Release acceptance needs a resolved dependency tree, real SDK/model/preset smoke
and quality tests (VI, EN, code-switching, numerals, punctuation, long text, missing
words), license/voice authorization review, disk/RAM/time measurements, target-OS
behavior and actual Electron playback/focus/keyboard/IME/responsive EN/VI screens.
Controlled SDK/graph fixtures must never be substituted for these gates.
