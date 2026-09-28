// The pinned FFmpeg 9.0.2 builds `stage:ffmpeg` ships; `gpl-sources.mjs` names their source.
const RIEDL = 'https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2';
const GYAN = 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2';
const GYAN_ROOT = 'ffmpeg-9.0.2-essentials_build/bin';

// Only the platforms the release workflow builds on (macos-latest, windows-latest).
export const BUILDS = {
  'darwin-arm64': [
    {
      url: `${RIEDL}/ffmpeg.zip`,
      sha256: 'c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924',
      files: { ffmpeg: 'ffmpeg' },
    },
    {
      url: `${RIEDL}/ffprobe.zip`,
      sha256: 'fcbe839537485eaee7a7a8bc5cbc0f90d53617e80943e8a5b2e31cb851197ea6',
      files: { ffprobe: 'ffprobe' },
    },
  ],
  'win32-x64': [
    {
      url: `${GYAN}/ffmpeg-9.0.2-essentials_build.zip`,
      sha256: '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba',
      files: { 'ffmpeg.exe': `${GYAN_ROOT}/ffmpeg.exe`, 'ffprobe.exe': `${GYAN_ROOT}/ffprobe.exe` },
    },
  ],
};
