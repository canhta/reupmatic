# Third-party notices

Reupmatic itself is licensed under **Apache-2.0** (see `LICENSE`). The packaged app bundles the
components below, each under its own licence. This file ships inside the app.

## FFmpeg and ffprobe

- **Licence: GPL-3.0-or-later.** Both bundled builds are configured `--enable-gpl
  --enable-version3` without `--enable-nonfree` and link GPL-only components — the app encodes
  with `libx264` (`worker/media/encoding.py`, `worker/vision/service.py`) — so each whole binary
  is GPLv3, not LGPL.
- **Binaries:** static FFmpeg **9.0.2** `ffmpeg`/`ffprobe` under `resources/ffmpeg/`, with libass
  0.17.5 or later. `scripts/package-ffmpeg.mjs` pins each download by SHA-256 and writes the build
  strings to `resources/ffmpeg/VERSION.txt`.
  - macOS arm64: Martin Riedl's build server release `1789931890_9.0.2`
    (<https://ffmpeg.martin-riedl.de/info/detail/macos/arm64/1789931890_9.0.2>), libass 0.17.5.
  - Windows x64: gyan.dev `ffmpeg-9.0.2-essentials_build`
    (<https://github.com/GyanD/codexffmpeg/releases/tag/9.0.2>), libass 0.17.5-8-gb2fe9d8; the
    component versions are listed in that archive's `README.txt`.
- **How it is used:** invoked as separate executables over a pipe; the app does not link FFmpeg
  into its own process, so this is aggregation, not a derivative work. FFmpeg's own GPL obligations
  still apply to the binary.
- **Corresponding source:** attached to the GitHub release of this version, at
  <https://github.com/canhta/reupmatic/releases> (tag `v<version>`), and described in its
  `CORRESPONDING-SOURCE.txt`:
  - `ffmpeg-9.0.2.tar.xz`, FFmpeg 9.0.2 (<https://git.ffmpeg.org/ffmpeg.git>, tag `n9.0.2`,
    commit `946fcce07b`), the source of both builds;
  - `martin-riedl-ffmpeg-build-script-6a611e19870e.tar.gz`, the macOS build script at commit
    `6a611e19870e197bc37c6e4c7fccddebd3715466` of <https://git.martin-riedl.de/ffmpeg/build-script>,
    which built release `1789931890_9.0.2` and pins every linked library's version and source;
  - `gyan-ffmpeg-9.0.2-essentials_build-README.txt`, the Windows build's configuration and linked
    library versions, from the shipped archive.

## Python runtime and packages

The packaged app bundles a CPython interpreter (from `python-build-standalone`,
<https://github.com/astral-sh/python-build-standalone>, PSF/BSD-style licence) and the Python
packages named in `worker/requirements.txt` and `worker/requirements-optional.txt` (for example
`faster-whisper`, `ctranslate2`, `sentencepiece`, `vieneu`,
`rapidocr`, `onnxruntime`, `opencv-python`), each under its own licence. Enumerate the installed
set with `<resources>/python/bin/python3 -m pip list`; their licence metadata is in each
distribution's `*.dist-info`.

Packages whose licence is not permissive, as their own package metadata declares it:

- **PyAV 18.1.0** (`av`, pulled in by `faster-whisper`, base bundle): the binding itself is
  **BSD-3-Clause**. Its wheel bundles its own **FFmpeg 8.1.2** shared libraries (`libavcodec`,
  `libavformat`, `libavutil`, `libavfilter`, `libavdevice`, `libswscale`, `libswresample`),
  configured `--enable-version3` without `--enable-gpl`, which report themselves as
  **LGPL-3.0-or-later**. The same wheel also ships `libx264` and `libx265` (**GPL-2.0-or-later**),
  which that `libavcodec` links, beside permissively licensed codec libraries. The libraries are
  separate shared objects under `av/.dylibs` (macOS) or `av.libs` (Windows), so each can be
  replaced. `worker/requirements-speech.txt` pins `av==18.1.0`. Corresponding source, attached to
  the same GitHub release as FFmpeg's: `av-18.1.0.tar.gz` (PyAV tag `v18.1.0`),
  `pyav-ffmpeg-8.1.2-1.tar.gz` (<https://github.com/PyAV-Org/pyav-ffmpeg> release `8.1.2-1`,
  commit `a71bf9279f7a4659154b68ba6783e89be460bcd5`, whose build script pins libx264, libx265 and
  every other bundled library's source) and `ffmpeg-8.1.2.tar.xz`.
- **soxr 1.1.0** (python-soxr, synthesis runtime pack): **LGPL-2.1-or-later**. Its extension
  embeds a modified libsoxr (LGPL-2.1-or-later) and PFFFT; the licence texts ship in
  `soxr-1.1.0.dist-info/licenses/`. Source: <https://github.com/dofuuz/python-soxr> and the
  modified libsoxr at <https://github.com/dofuuz/soxr>.
- **tqdm 4.70.1** (base bundle): **MPL-2.0 AND MIT**; the licence text ships in
  `tqdm-4.70.1.dist-info/licenses/LICENCE`. Source: <https://github.com/tqdm/tqdm>.

## Bundled fonts

- **Be Vietnam Pro** (Regular and Bold), `fonts/BeVietnamPro-Regular.ttf` and
  `fonts/BeVietnamPro-Bold.ttf`, shipped under `resources/fonts/`. Both libass (export) and
  JASSUB (the live monitor) load these exact files, so a subtitle looks the same on every machine.
- **Licence: SIL Open Font License 1.1.** Copyright 2021 The Be Vietnam Pro Project Authors
  (<https://github.com/bettergui/BeVietnamPro>). The licence text ships beside the fonts as
  `fonts/OFL.txt` and is reproduced below.

```
Copyright 2021 The Be Vietnam Pro Project Authors (https://github.com/bettergui/BeVietnamPro),

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## Model weights

No model weights are bundled. The offered-model catalogue downloads them at the user's explicit
action, and each entry states its own licence before any byte moves (D-56).
