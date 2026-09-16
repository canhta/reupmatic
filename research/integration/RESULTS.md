# Integration Results — 0.1

> Recorded: 2026-09-15. Actual Linux execution, not target-desktop or production certification.

**28 tests passed; 1 test skipped.** Python: 19 passed + 1 skipped. Node: 9 passed. No UI, model-inference or Windows/macOS pass is implied.

| Evidence | Executed result |
|---|---|
| [Python tests](python-tests.txt) | Contract shape/semantics plus native worker tests; 20 discovered, one genuine pysubs2 round-trip skipped because the package is missing. |
| [Node tests](node-tests.tap) | Eight product edit/stale-result checks and one real TypeScript → Python → FFmpeg process test. |
| [TS syntax](ts-syntax.json) | First-party core/Electron/React sources parse. **This is not a semantic UI typecheck, package resolution or application launch.** |
| [Machine-readable results](results.json) | Environment, scope, counts, missing packages, and limits. |

The native exercise opens a path containing Vietnamese characters, spaces and an apostrophe, references the original, probes it, uses registered SRT, renders full/sample outputs, preserves audio, and verifies the original was not changed. The 2-second sample has 60 decoded frames matching the corresponding interval of the full lossless render. Source/subtitle changes and cache corruption are handled; invalid input is isolated; cancellation leaves the worker available. Peak generation is bounded to 1,000 returned values.

**Important distinction:** the subtitle-content render test modifies a fixture SRT programmatically, then uses native FFmpeg/libass. It does not prove that the React table or pysubs2 integration works. The product cue commands are tested independently, and the actual library round-trip is explicitly skipped. No fake OCR/LaMa output is used.

The first cache-rebuild assertion incorrectly compared entire Matroska file hashes. Container metadata may differ even when rendered content is valid. The [initial test output](python-tests-initial.txt) is retained. The corrected check verifies a real rebuild, media validity/duration and the result manifest checksum; a separate test compares decoded video frames. This correction does not establish pixel parity with JASSUB.

## Environment and dependency block

Python 3.13.5, Node 22.16.0, installed TypeScript 5.8.3, FFmpeg 7.1.5/libass in Linux x86-64. The exact FFmpeg banner is recorded in JSON. No new npm or Python subtitle package was installed. The npm registry request failed DNS; the configured pip environment supplied no matching package. UI sources therefore remain an integration candidate, not a tested executable app.

## Source checks for the adapter code

These primary sources were consulted for public interfaces; they are separate from executed evidence. Moving branch docs are not proof that a published package has the same files/types.

| Source | Used for / limitation |
|---|---|
| [Timeline interface](https://raw.githubusercontent.com/xzdarcy/react-timeline-editor/master/packages/timeline/src/interface/timeline.ts) and [manifest](https://raw.githubusercontent.com/xzdarcy/react-timeline-editor/master/packages/timeline/package.json) | Documented move/resize/onChange/cursor bindings; manifest 1.0.0 with workspace references, still requiring published-package verification. |
| [WaveSurfer](https://github.com/katspaugh/wavesurfer.js) | Reuse the media element and precomputed peaks; no custom waveform renderer or second audio clock. The trial manifest stays on the v7 major; not installed here. |
| [JASSUB](https://github.com/ThaUnknown/jassub) and [worker API](https://raw.githubusercontent.com/ThaUnknown/jassub/master/src/worker/worker.ts) | `ready`, `renderer.setTrack`, local worker/font behavior; bundling, assets, protocol and native parity remain untested. Remote font queries are disabled in adapter source. |
| [pysubs2 API](https://pysubs2.readthedocs.io/en/latest/api-reference.html) and [PyPI metadata](https://pypi.org/pypi/pysubs2/json) | Library-owned loading, event plaintext and SRT/ASS serialization; current 1.9.0 requirement is declared but unavailable locally. No replacement parser added. |
| [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc) and [protocol API](https://www.electronjs.org/docs/latest/api/protocol) | Narrow preload verbs and registered local-media scheme. Secure-path/Range behavior still requires actual Electron tests. |

The system's FFmpeg build and fonts were used for local tests only and are not shipped. No dependency-license, packaging, benchmark, live-account or commercial-policy gate is passed by these checks.
