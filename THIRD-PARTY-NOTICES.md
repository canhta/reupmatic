# Third-party notices

Reupmatic itself is licensed under **Apache-2.0** (see `LICENSE`). The packaged app bundles the
components below, each under its own licence. This file ships inside the app.

## FFmpeg and ffprobe

- **Licence: GPL-3.0-or-later.** The bundled build enables GPL-only components — the app encodes
  with `libx264` (`worker/media/encoding.py`, `worker/vision/service.py`) — so the whole FFmpeg
  binary is GPL, not LGPL.
- **Binaries:** `ffmpeg`/`ffprobe` under `resources/ffmpeg/`, staged from the pinned `ffmpeg-static`
  build and `@ffprobe-installer/ffprobe` (its `ffprobe-static` "darwin-arm64" binary is x86_64, so
  the installer family is used for ffprobe). The exact build string is written to
  `resources/ffmpeg/VERSION.txt` at package time.
- **How it is used:** invoked as separate executables over a pipe; the app does not link FFmpeg
  into its own process, so this is aggregation, not a derivative work. FFmpeg's own GPL obligations
  still apply to the binary.
- **Corresponding source:** the FFmpeg project publishes its source at <https://ffmpeg.org/download.html>
  and <https://git.ffmpeg.org/ffmpeg.git>. The `ffmpeg-static` builds and their build scripts are at
  <https://github.com/eugeneware/ffmpeg-static>. **Owner action:** host or link the exact
  corresponding source for the shipped build and record its URL here before release; the GPL
  requires the offer to accompany distribution.

## Python runtime and packages

The packaged app bundles a CPython interpreter (from `python-build-standalone`,
<https://github.com/astral-sh/python-build-standalone>, PSF/BSD-style licence) and the Python
packages named in `worker/requirements.txt` and `worker/requirements-optional.txt` (for example
`faster-whisper`, `qwen-asr`, `torch`, `transformers`, `ctranslate2`, `sentencepiece`, `vieneu`,
`rapidocr`, `onnxruntime`, `opencv-python`), each under its own licence. Enumerate the installed
set with `<resources>/python/bin/python3 -m pip list`; their licence metadata is in each
distribution's `*.dist-info`.

## Model weights

No model weights are bundled. The offered-model catalogue downloads them at the user's explicit
action, and each entry states its own licence before any byte moves (D-56).
