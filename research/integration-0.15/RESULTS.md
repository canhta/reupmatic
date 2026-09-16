# Reupmatic 0.15.0 — verification and handoff

Date: 2026-09-16. Input: supplied `reupmatic-v0.14.zip` (893 source files plus its
release metadata). Output: increasing source-only 0.15.0 handoff. This is not an
installer, production release, actual-model acceptance or completed system.

## Delivered increment

Spoken-layer local preset synthesis now reaches the existing Python queue from
Editor through typed native IPC. The adapter uses an explicitly pinned local
VieNeu v3 Turbo ONNX/CPU boundary and numeric presets. Explicit native manifest
configuration verifies prepared files; no model acquisition, voice cloning or
cloud service is exposed. A local helper creates hashes for an already prepared
bundle and refuses existing output manifests.

Requests capture selected/all spoken cues, token/revision, voice/model and VI/EN
content declaration. Cancellable child inference produces natural sequential mono
48 kHz PCM16 WAV, 250 ms inter-cue gaps, actual audio spans and a typed private JSON
receipt. Output admission checks correlation, metadata, confined files, PCM shape
and SHA-256. Cancellation, late results, failed retries and temporary cleanup use
the same queue/process mechanisms, not an additional engine.

Editor review compares captured words and source/actual clocks, offers verified
local audio audition, manual content review and separate native WAV/receipt saves.
Spoken changes invalidate review/save; unrelated displayed edits do not. Native
save uses opaque expiring choices with a source check after the dialog, then
re-verifies the artifact and protects imported originals, selected manifests,
remembered model files and live drafts. There is no automatic text, soundtrack,
video, rendering or project-history mutation.

## Executed results

Full aggregate command: `npm test`, **exit 0**, in `logs/npm-test.txt`.

| Suite | Result |
| --- | --- |
| Core, including real available TypeScript core build | 220 passed |
| TS/Python bridge and local native workflows | 11 passed |
| Structure/scope guards | 10 passed |
| Architecture guards | 6 passed |
| UI-source/library guards | 23 passed |
| Tooling configuration guards | 6 passed |
| Python | 167 run: 164 passed, 3 explicitly skipped |
| **Unique aggregate total** | **440 passed, 3 skipped, 0 failed** |

The 45 structure/architecture/UI/tooling tests are source/configuration guards, not
full UI or formatter runs. Python skips are the existing pysubs2-dependent serializer
cases. This adds 40 test cases over the supplied 0.14 aggregate; subtests and repeat
commands are not counted again.

A final affected rerun (`logs/synthesis-final.txt`) compiles core and runs the 21
synthesis core/native/UI-source cases plus 19 Python synthesis/manifest cases.
This includes the post-review PCM-silence fix. It is repeat coverage, not 40 extra
unique tests. An earlier full aggregate completed while targeted hardening was
being finalized; the final affected rerun is the freshness evidence for those edits.
Structure/scope/contracts checks are repeated before packaging.

Native synthesis evidence uses the real host coordinator, WorkerClient, Python
worker queue, child process, NumPy PCM data, file/hash/range-response boundaries,
and controlled SDK/graph fixtures. It **does not run the real VieNeu SDK or weights**;
the fixture produces a sine wave, not evaluated human speech. Native Electron
window/dialog/playback interactions were not executed.

Red/green logs preserve missing-module implementation start, model-file overwrite
protection and quiet float audio that became silent after PCM16 quantization. The
latter now fails before artifact publication. Early manifest helper fixture order
assumptions were corrected; final current-registry roundtrips pass.

## Environment and blocked gates

Observed Linux x86-64; Node 22.16.0, npm 10.9.2, global TypeScript 5.8.3, Python
3.13.5, NumPy 2.3.5 and FFmpeg/ffprobe 7.1.5. Node 24 / TypeScript 7 and configured
Python target remain unvalidated. A preinstalled genuine Node type package was
symlinked into excluded `node_modules` for core compilation; no fake declarations
or dependency lock were created. See `logs/environment.txt` and baseline logs.

| Command/gate | Actual status |
| --- | --- |
| `npm run typecheck` | Exit 2: missing Electron/Chokidar type dependencies; full app gate not passed. |
| `tsc -p tsconfig.ui.json --noEmit` | Exit 2: missing vite/client types; React/Astryx UI types unresolved. |
| `npm run build` | Exit 2 at Node compile; no validated Vite/Electron build. |
| `npm run check` | Exit 127: Biome executable missing. |
| `npm run check:python` | Exit 1: Ruff module missing. |
| Astryx installed CLI discovery/docs | Exit 1: package/CLI absent. |
| TS/TSX/CTS source parsing | 207 app files parsed with zero parse diagnostics. Syntax only, not full typecheck. |
| Installed Electron/E2E, EN/VI screenshots, keyboard/focus/IME, real playback | NOT RUN. |
| Real SDK/model/preset quality, resource budgets and target OS installers | NOT RUN. |

No application dependency tree was resolved, no online model was downloaded and
no compiled desktop artifact is included. The optional SDK pin is source-reviewed,
not a reproducible transitive runtime lock. See the development guide's primary
upstream references and narrow version-specific boundary.

## Contracts, lifetime and safety limits

Project schema **5** and text layers **2** remain unchanged from 0.14; current
schema-5 files do not need migration. Older unsupported formats remain explicitly
rejected intact. No dual reader, compatibility shim, reset or silent migration.

Speech drafts/review are session-only. Generated workspace cache files are not
automatically reopened or cleaned by a new resource manager. Save WAV and receipt
explicitly before leaving the document; each native save is atomic individually,
not an atomic pair. Receipt includes private text/provenance but no native paths.

Input is bounded to 100 cues, 300 UTF-16 units/cue, 20 kB text, public request limits
and 512 phonemized model tokens/cue. Each segment is under 60 seconds and total
WAV at most 600 seconds. Source clocks are recorded, not alignment instructions.
The VI/EN declaration does not force an accent; the SDK normalizer is bilingual.
Waveform validation cannot prove every word was spoken because this API does not
supply a reliable completion flag. Human audition is required, not quality-certified.

Hash pinning does not prove licenses, voice consent, graph precision or safety.
Python audit/environment restrictions are not an OS sandbox or isolation against
malicious native libraries. Preview verification occurs at grant time, not on every
read. Concurrent external filesystem mutation is not a global isolation guarantee.
Only trusted, independently authorized local model/preset bundles should be used.

## Skills, source preservation and package audit

Both local skills and their three references were reviewed and retained unchanged;
see `SKILLS_REVIEW.md`. Original root AGENTS and prior evidence are retained.
All 893 input source paths remain, including 96 marker files; no paths are moved.
All 12 public assets and five skill/reference files remain byte-identical.
`logs/preservation.json` records exact source counts, changed/new paths and the
input archive digest. No previous versioned archive is overwritten.

Source packaging runs version/README/changelog/evidence checks, all path/scope/
contract guards and exclusive increasing-version output. `RELEASE.json` contains
all selected source-file SHA-256 hashes. The external 0.15 verification report
records final ZIP integrity/hash verification and any completion-notification
attempt, which necessarily occurs after packaging. No font/model/voice binaries,
node_modules, compiled output or local caches are distributed.

## Next increment and retained product scope

Next is **0.16**: reviewed segment timing/alignment, conflict/rate/pause bounds and
explicit integration through the current audio/render boundary, preserving manual
words and recoverable original audio. Then full-duration mixing, project/Library
speech dependencies and durable batch/Automation recipes.

Downloads and authorized intake, independent classification endpoints, complete
Automation, connected publishing, resources and account/Plus policy remain tracked.
All five areas, three modes, 14 scope groups, 76 features and 24 flows remain in
scope. A directory, controlled fixture or source-only screen is not a finalized
feature. The whole system is not finished.
