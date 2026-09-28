// The GPL/LGPL corresponding source for what a release bundles; `stage:source` collects it and the
// release workflow attaches it to the GitHub release. THIRD-PARTY-NOTICES.md names each file.
import { BUILDS } from './ffmpeg-builds.mjs';

const [gyan] = BUILDS['win32-x64'];

export const GPL_SOURCES = [
  {
    file: 'ffmpeg-9.0.2.tar.xz',
    what: 'FFmpeg 9.0.2, the source of both bundled ffmpeg/ffprobe builds',
    url: 'https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz',
    sha256: '8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e',
  },
  {
    file: 'martin-riedl-ffmpeg-build-script-6a611e19870e.tar.gz',
    what: "Martin Riedl's build script at the commit that built macOS arm64 release 1789931890_9.0.2",
    git: {
      repository: 'https://git.martin-riedl.de/ffmpeg/build-script.git',
      commit: '6a611e19870e197bc37c6e4c7fccddebd3715466',
    },
  },
  {
    file: 'gyan-ffmpeg-9.0.2-essentials_build-README.txt',
    what: "gyan.dev's configuration and library version list for the Windows x64 build",
    url: gyan.url,
    archiveSha256: gyan.sha256,
    member: 'ffmpeg-9.0.2-essentials_build/README.txt',
    sha256: '0342de6bb39dd421cbec2c00d89ad274b640d75ad3f2cab09ffd647ce2d8f949',
  },
  {
    file: 'av-18.1.0.tar.gz',
    what: 'PyAV 18.1.0 (tag v18.1.0) source distribution',
    url: 'https://files.pythonhosted.org/packages/8d/f4/f22114d30d3435e38c6af2b4870f37b864403dca6ae7af747a289ce0a18e/av-18.1.0.tar.gz',
    sha256: '47bfc286e1bc9de7ab4681fc2b575cd2460a66919d31ffe1bd5aa54fae531a28',
  },
  {
    file: 'pyav-ffmpeg-8.1.2-1.tar.gz',
    what: "pyav-ffmpeg 8.1.2-1, the build scripts and patches for the PyAV wheel's FFmpeg libraries",
    git: {
      repository: 'https://github.com/PyAV-Org/pyav-ffmpeg.git',
      commit: 'a71bf9279f7a4659154b68ba6783e89be460bcd5',
    },
  },
  {
    file: 'ffmpeg-8.1.2.tar.xz',
    what: "FFmpeg 8.1.2, the source pyav-ffmpeg 8.1.2-1 patches and builds for PyAV's libraries",
    url: 'https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz',
    sha256: '464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c',
  },
];
