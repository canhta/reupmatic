# Local speech synthesis — bounded 0.15 slice

Authority: BUSINESS_SCOPE SC-03/04/05/07/11/14, editor speech requirements and
`specs/local-speech.md`. Covers SC-04-F03/05/06, SC-05-F05 and partial FLOW-08/22.
This is not a new pipeline or completion of alignment, batch or Automation.

## Input and configuration

Only the independent spoken layer can supply speech. The user explicitly chooses
selected cue or all cues, configured preset voice and content language VI/EN.
Content language is independent from UI locale. A known conflicting spoken-layer
language or stale inherited text must be corrected/reviewed before generation.
Preset data is precomputed and authorized by the user; there is no voice enrollment,
cloning, download, cloud fallback or hidden credential flow.

A native JSON manifest selects a strictly confined local FP32 VieNeu v3 Turbo ONNX
bundle, exact files/hashes and numeric voice presets. Configuration is atomic and
cancellable; failed setup keeps the old configuration. Availability means structure
and the declared SDK are discoverable, not that hashes, inference or quality passed.
Every job verifies model identity/files before execution and again after inference.
The adapter is deliberately version-pinned; incompatible SDKs fail, not fall back.

Requests capture immutable spoken token/text/clocks, model/voice/content-language,
request identity and revision. Limit 100 nonempty cues, 300 UTF-16 units per cue,
20,000 text UTF-8 bytes, 63,000 serialized parameter bytes and 64,000 envelope bytes.
Phonemized model input above 512 tokens is rejected, never sliced to fit.

## Execution and artifacts

Typed IPC delegates to the existing shared worker queue and existing ProcessRunner.
A local inference child is cancellable/reaped. Python offline environment and audit
guards block covered network/subprocess attempts; they are not an OS sandbox.
Only trusted, independently licensed local bundles should be used.

Output is mono 48 kHz PCM16 WAV. Cues are synthesized in document order at natural
speed, with 250 ms between them; no source-time padding or rate fitting. Each segment
must be finite/nonempty/non-silent and under 60 seconds; total output at most 600
seconds. No trimming of words or output to satisfy those bounds is permitted.
Captured source clocks and actual frame spans are both recorded. The SDK does not
expose a reliable completion/EOS flag here: finite audio is NOT proof that every
word was spoken. The user must audition and check omissions before saving.

Worker promotion publishes WAV plus typed JSON receipt together in a fresh owned
artifact directory only after validation. Cancellation/failure removes scratch.
Host validates identifiers, input correlation, receipt, PCM header, size and SHA-256
before admitting a draft; it refuses symlinks, extra files and substituted output.
Cancelled late results are not displayed; verified owned late artifacts are removed.
Failed retries preserve the previous draft. Existing original media is never edited.

## Review, export and stale ownership

Review shows captured words, voice/model/runtime, source time and actual audio time,
with pagination. The user explicitly verifies/opens the local audio preview, starts
playback and manually attests review before export. Playback start is not proof of
full listening; this is an explicit human review step, not an audio-quality score.

Spoken token/text/timing/language or copy-source staleness invalidates the draft for
review/export. Displayed-only edits do not. Native save uses an opaque expiring
choice, then the renderer checks the spoken document again after the dialog before
committing. Caller-provided filesystem paths are never admitted at this boundary.
Save re-verifies the artifact and protects imported originals, live artifacts,
selected manifests and remembered configured model files, including hardlink aliases.
One file is saved atomically; WAV and receipt saves are independent transactions.
Preview integrity is checked when granting media access, not continuously during
playback; concurrent external filesystem changes are not an OS-isolation guarantee.

Drafts and review state are session-only, not project/SQLite speech persistence.
Generated cache files remain until explicitly managed; closing/reopening does not
rediscover them. Receipt contains private text/provenance, so do not share it without
review. Project schema 5 and text-layer schema 2 are unchanged from 0.14. No existing
text, subtitle style, soundtrack, video, undo state or render is silently changed.

## Evidence and remaining acceptance

Behavioral core/native/worker tests and source UI guards are recorded separately.
Controlled SDK fixtures prove orchestration/failure handling, not actual inference,
model quality, supported accent, commercial permissions or installed UI behavior.
Real SDK/weights, authorized voices, language/omission/prosody tests, full target
Electron/EN/VI/IME/accessibility and OS installer checks remain acceptance gates.
Segment alignment/mixing, durable speech recipes/recovery, project/Library audio
associations and resource scheduling remain follow-on work.
