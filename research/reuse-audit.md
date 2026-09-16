# Reuse Audit — Editor, Subtitles, and Python Media Workers

> Checked: 2026-09-15 · Package: 1.8 · Research ID: R-16.
> Scope: reusable components for the next integration exercise, not a new product scope or a production certification.
> Authority: D-40–D-41 in [DECISIONS.md](../DECISIONS.md). No first-party Rust or Rust rewrite roadmap. English documentation; English/Vietnamese application UX.

## 1. Recommendation

Use **Electron/React/TypeScript + a Python production worker + existing native libraries**. For the first integration exercise, use an existing timeline component, waveform/region controls, subtitle format library, and subtitle renderer. Do not predeclare a custom timeline/compositor/parser as necessary work.

**Trial combination:** `@xzdarcy/react-timeline-editor` + `wavesurfer.js` + JASSUB on the UI side; `pysubs2`, FFmpeg/libass, OpenCV/NumPy, and RapidOCR/ONNX Runtime in the worker. PyAV is optional when direct frame/packet access is necessary. LaMa-ONNX remains the image reconstruction candidate; detection and mask generation remain separate. These are proposed bindings, not a tested lockfile.

The timeline component is **not a complete NLE**. Product-specific cue editing, command/undo behavior, clip/audio time mapping, persistence, protected manual edits, and links to jobs/workflows still need implementation. The choice avoids rebuilding interaction/render primitives; it does not remove features or establish a delivery-time saving before integration.

## 2. Editor candidates — only three paths

| Candidate | What can be reused | Integration cost / licensing finding | Recommendation |
|---|---|---|---|
| Component composition | xzdarcy timeline interaction; WaveSurfer waveforms/regions; JASSUB ASS rendering. [RU01–03] | Requires shared project/playback bindings and our full subtitle editing workspace. Timeline source is MIT, WaveSurfer BSD-3-Clause; JASSUB's published manifest lists multiple bundled dependency licenses, not MIT alone. | **First integration target.** Small replaceable boundaries; verify real package artifacts and behavior before committing. |
| Twick SDK | Existing timeline/canvas/player/editor packages. [RU09] | Broader UI reuse, but its formal SUL restrictions are wider than permissive README examples, including some hosted/competing uses. The reviewed video-editor/timeline test scripts are placeholders, not package test evidence. Its render-server README excludes Windows; do not generalize that to its browser UI or assume a local export replacement is free. | **Conditional alternative**, not silently licensed for our product. Clarify distribution terms and measure the local media/export adapter before adoption. |
| OpenVideo, formerly linked as Designcombo | Existing multi-track editor and browser rendering. [RU10] | The original GitHub URL redirects. Current license is custom, with derivative resale restrictions in addition to entity-size conditions. A small team is not by itself proof this product's distribution is permitted. | **Not the default under unreviewed terms.** Evaluate only with suitable authorization; do not call the current tree MIT or infer its renderer from the old repository description. |

Licensing findings are implementation gates, not a general conclusion that source-available or paid SDKs are unsuitable. A suitable licensed SDK may reduce total work. No purchase, contact with a maintainer, or commercial agreement was made here.

### Concrete responsibilities within the component path

| Requirement | Reuse | Product-specific integration still required |
|---|---|---|
| Track rows, draggable/resizable intervals, playhead | Timeline component [RU01] | Clip/source-time mapping, split/merge semantics, snapping behavior validation, selection and undo, many-cue performance. |
| Audio waveform, region selection, loop/seek controls | WaveSurfer [RU02] | One playback clock, synchronized timeline scale, cached/precomputed peaks for long files. It is not an audio-cutting or mixing engine. |
| Editable subtitle content | `pysubs2` for SRT/ASS I/O/retiming; existing React controls [RU04] | The full cue table, direct text/timing edits, find/replace, scoped style, source/translation comparison, manual-edit protection, and display-versus-spoken-text separation from Editor §10. |
| Styled subtitle preview | JASSUB/libass family [RU03] | Controlled local fonts/worker/WASM loading, cue updates, correct time mapping and preview labeling. Compare against native libass; shared ancestry is not pixel-equivalence proof. |
| Real sample/full render | Native FFmpeg/libass [RU05] | Same settings and effect ordering, sample context, cache validity, cancel/stale-result behavior, and output artifact records. No new codec or font renderer. |

For multi-clip/overlay preview, retain the earlier Mediabunny/PixiJS integration direction only where required; test it against the selected controls rather than creating another renderer. A working single-video preview does not pass the full Editor gate.

## 3. Python pipelines — reuse without importing an entire desktop application

| Candidate | Source-derived finding | Decision for this exercise |
|---|---|---|
| Modular Python + native libraries | RapidOCR provides a Python OCR deployment path; pysubs2 handles subtitle formats; PyAV accesses FFmpeg media data and explicitly advises using FFmpeg CLI when sufficient. [RU04–06] | **Primary worker direction.** Keep library boundaries; no per-pixel Python rewrite of native operations. Preserve existing Whisper/LLM/TTS candidates; this pass does not reselect every model. |
| YaoFANGUK VSE/VSR | VSE documents timed extraction, duplicate-line handling and SRT/TXT output. VSR exposes detection/inpainting, range grouping, frame prefetch/writing and CLI entry. Root licenses are Apache-2.0. Inspected backend imports still reach GUI configuration; VSR imports multiple engines and its LaMa path uses PyTorch weights rather than the Carve ONNX artifact. [RU07–08] | **Selective module/algorithm reuse after provenance/dependency checks**, not a wholesale GUI fork or an assumed ONNX-ready headless SDK. Use the existing pipeline as a comparison/reference and adapt compatible portions. |
| pyVideoTrans | Provides transcription/translation/dubbing/synchronization and CLI use under GPL-3.0. [RU11] | **Integration reference; code incorporation remains conditional on distribution choices.** GPL permits commercial use but carries obligations. Do not treat a subprocess boundary as automatic exemption or copy its code into a differently licensed product without review. |

**Model boundary:** Carve recommends `lama_fp32.onnx`, with a documented fixed 512×512 input and opset 17. Use it as an inference trial, not as proof of temporal video quality or complete weight provenance. Do not assume VSR's LaMa adapter is interchangeable without changes. [RU08, RU12]

**Excluded automatic dependency:** ProPainter explicitly restricts code and models to noncommercial use under its stated license. Do not bundle it merely because an Apache-licensed wrapper imports it; separate permission would be required. Other transitive dependencies also need their own checks. [RU13]

## 4. Maintenance and packaging observations

These are evidence signals, not community-size scores or response-time guarantees:

- Timeline has an inspected `v1.0.0` release, with editor and engine separated. Its source manifest contains workspace references and source entry points: validate the published tarball with the selected React/Vite version before relying on installability. [RU01]
- WaveSurfer documents plugins and a test suite; the inspected main manifest is `8.0.0-beta.5`. Prefer a verified stable published release for the exercise, not an automatic beta upgrade. Long-file decoding/memory limitations are documented. [RU02]
- Current inspected PyAV and pysubs2 sources require Python 3.12 or later. Begin compatibility resolution around Python 3.12, then confirm all AI/runtime wheels; do not copy old Python 3.10 instructions from another app into this dependency set. PyAV documents platform wheels, but this audit did not install them. [RU04–05]
- RapidOCR includes model-origin/license guidance and a Chinese/English documentation/community surface. Model and recognition dictionary selection must still be validated for Vietnamese; default Chinese/English support is not enough. [RU06]

Web retrieval covered primary repositories, Chinese-language VSE/VSR material, model cards, and package manifests. Search/community results were discovery leads, not performance proof. Not every project's latest commit or maintainer response history was established; do not describe the whole shortlist as production-proven or equally maintained.

## 5. What actually ran

Evidence: [script](media-smoke/media_smoke.py), [results](media-smoke/results.json), [full interval frame hashes](media-smoke/full-frame-hashes.txt), [sample frame hashes](media-smoke/sample-frame-hashes.txt).

**8/8 checks passed** using the installed Python 3.13.5 and FFmpeg 7.1.5/libass in a Linux x86-64 container. The fixture was a locally generated 12-second, 320×180, 30 fps video with synthetic audio and Vietnamese/English subtitle text. No user media or account data was used.

The checks cover text preservation through SRT→ASS→SRT, full/sample duration, retained audio/video, 120 sample frames, matching decoded frame hashes against the corresponding full-render interval, a programmatic subtitle edit changing the sample, and an unchanged source file. Lossless FFV1/FLAC avoids confusing codec-loss differences with rendering differences.

**Not tested:** interactive editing, Electron/React components, WaveSurfer, JASSUB, pysubs2, PyAV, OCR, ONNX/LaMa, video inpainting, GPU performance, commercial API calls, scheduling, billing, target-OS installers, VFR/HDR, or multi-clip render parity. This is a foundation smoke check—not the planned complete integration test or a performance benchmark. No time-to-delivery estimate follows from it.

The container's direct external GitHub request failed DNS resolution; no new npm/pip packages or weights were installed. Sources were inspected through web retrieval. No verified dependency lockfile or whole-repository checkout is claimed. The system FFmpeg binary is GPL-enabled; it and the system fonts are **not distributed** in this package or selected as the shipping binary.

## 6. Next integration exercise — one concrete path

**Open a local video → existing timeline and full editable cue table → OCR-derived or imported cues → actual processed sample → full output → call the same worker for a small batch.** OCR or LaMa unavailability must remain visible; a mock result cannot be represented as a passed AI test. Profile selection is optional; auto processing has no mandatory per-cue/mask approval.

| Step | Deliverable / completion evidence |
|---|---|
| A. Install and bind UI components | Pin packages; prove drag/resize/split selection and direct Vietnamese/English cue editing, input-method behavior, undo, waveform/playback sync, and preview updates. No dependency on external transcription services. |
| B. Connect the Python worker | A small versioned request/result/progress boundary using artifact references; same native sample/full path; cache and stale-result checks. Validate JASSUB/native typography and fonts rather than relying only on our FFmpeg smoke check. |
| C. Add selected OCR/removal adapters | Measure purpose-aware OCR, manual/auto masks, no mandatory review, LaMa crop/context/temporal quality and memory on authorized fixtures. Reuse compatible VSE/VSR parts with license notices and no unrelated engine auto-install. |
| D. Reuse in batch and package | Same worker handles multiple items; one bad input does not corrupt the rest. Run installed builds on macOS and Windows, including model setup, paths with diacritics/spaces, cancel/restart and preview contention. |

Only the small UI/worker/artifact interfaces needed by this exercise should precede it. Expand the full `contracts/` and `BUILD_PLAN.md` after validating these bindings. Keep the existing five-screen business scope unchanged. If a candidate fails, record the failure and switch that adapter; do not start a new engine or language redesign.

## 7. Source register

Access date for this pass: **2026-09-15**. Most links are moving branch/doc references, not immutable compatibility pins. The timeline release/tag is identified below; other versions are only manifest observations. No source repository, third-party binary, model weights, or fonts are redistributed with this audit.

| ID | Primary evidence | Coverage / version note |
|---|---|---|
| RU01 | [Timeline repository](https://github.com/xzdarcy/react-timeline-editor), [release](https://github.com/xzdarcy/react-timeline-editor/releases/tag/v1.0.0), [tagged package](https://raw.githubusercontent.com/xzdarcy/react-timeline-editor/v1.0.0/packages/timeline/package.json), [license](https://raw.githubusercontent.com/xzdarcy/react-timeline-editor/master/LICENSE) | Timeline trial v1.0.0; release page shows short commit `4148f4a`; package install/build not executed. |
| RU02 | [WaveSurfer](https://github.com/katspaugh/wavesurfer.js), [docs](https://wavesurfer.xyz/docs/), [manifest](https://raw.githubusercontent.com/katspaugh/wavesurfer.js/main/package.json) | Plugins, memory caveats, tests; main observed as 8.0.0-beta.5, not a selected stable version. |
| RU03 | [JASSUB](https://github.com/ThaUnknown/jassub), [inspected manifest](https://raw.githubusercontent.com/ThaUnknown/jassub/master/package.json) | ASS renderer/browser prerequisites; manifest 2.5.15 and composite license. Branch/package/version parity not installed or verified. |
| RU04 | [pysubs2](https://github.com/tkarabela/pysubs2), [manifest](https://raw.githubusercontent.com/tkarabela/pysubs2/master/pyproject.toml) | Subtitle I/O/retiming, MIT, inspected Python requirement. |
| RU05 | [PyAV](https://github.com/PyAV-Org/PyAV), [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html), [FFmpeg distribution guidance](https://ffmpeg.org/legal.html) | Native media reuse, installed foundation check, and separate shipping-binary audit. |
| RU06 | [RapidOCR](https://github.com/RapidAI/RapidOCR), [license](https://raw.githubusercontent.com/RapidAI/RapidOCR/main/LICENSE) | Python/ONNX path, language/model and provenance boundaries. |
| RU07 | [VSE English README](https://github.com/YaoFANGUK/video-subtitle-extractor/blob/main/README_en.md), [backend](https://raw.githubusercontent.com/YaoFANGUK/video-subtitle-extractor/main/backend/main.py), [license](https://raw.githubusercontent.com/YaoFANGUK/video-subtitle-extractor/main/LICENSE) | Timed OCR/extraction reuse; GUI/model/subtitle dependencies still need audit. |
| RU08 | [VSR Chinese README](https://github.com/YaoFANGUK/video-subtitle-remover/blob/main/README.md), [backend](https://raw.githubusercontent.com/YaoFANGUK/video-subtitle-remover/main/backend/main.py), [configuration](https://raw.githubusercontent.com/YaoFANGUK/video-subtitle-remover/main/backend/config.py), [license](https://raw.githubusercontent.com/YaoFANGUK/video-subtitle-remover/main/LICENSE) | Config declares 1.4.0; observed pipeline/GUI coupling and PyTorch LaMa path; not an installed CLI test. |
| RU09 | [Twick README](https://github.com/ncounterspecialist/twick), [formal SUL](https://raw.githubusercontent.com/ncounterspecialist/twick/main/LICENSE.md), [editor manifest](https://raw.githubusercontent.com/ncounterspecialist/twick/main/packages/video-editor/package.json), [timeline manifest](https://raw.githubusercontent.com/ncounterspecialist/twick/main/packages/timeline/package.json) | Manifest 0.15.0; licensing/readme tension, modular UI, package-level test placeholders. |
| RU10 | [Redirected editor](https://github.com/designcombo/react-video-editor), [current OpenVideo license](https://raw.githubusercontent.com/openvideodev/react-video-editor/main/LICENSE) | Current terms differ from old MIT assumptions; a commercial redistribution decision remains required. |
| RU11 | [pyVideoTrans](https://github.com/jianchang512/pyvideotrans), [GPL-3.0](https://raw.githubusercontent.com/jianchang512/pyvideotrans/main/LICENSE) | Complete workflow/CLI reference; not blanket permission to copy into any distribution model. |
| RU12 | [Carve/LaMa-ONNX](https://huggingface.co/Carve/LaMa-ONNX) | Named FP32 artifact, input/opset and conversion guidance; no inference or artifact checksum obtained. |
| RU13 | [ProPainter](https://github.com/sczhou/ProPainter) | Explicit noncommercial code/model declaration; not implicitly cleared by wrapper licensing. |
