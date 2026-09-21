import path from 'node:path';

export interface RuntimePathInput {
  packaged: boolean;
  resources: string;
  repo: string;
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  venvExists?: boolean;
}

export interface RuntimePaths {
  python: string;
  worker: string;
  ffmpeg: string;
  ffprobe: string;
}

const executable = (platform: NodeJS.Platform, name: string): string =>
  platform === 'win32' ? `${name}.exe` : name;

// Packaged and dev must not be mixed.
export function resolveRuntimePaths(input: RuntimePathInput): RuntimePaths {
  if (input.packaged) {
    return {
      python: path.join(
        input.resources,
        'python',
        ...(input.platform === 'win32' ? ['python.exe'] : ['bin', 'python']),
      ),
      worker: path.join(input.resources, 'worker', 'main.py'),
      ffmpeg: path.join(input.resources, 'ffmpeg', executable(input.platform, 'ffmpeg')),
      ffprobe: path.join(input.resources, 'ffmpeg', executable(input.platform, 'ffprobe')),
    };
  }
  const venv = path.join(
    input.repo,
    '.venv',
    ...(input.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']),
  );
  return {
    python:
      input.env.PYTHON ||
      (input.venvExists ? venv : input.platform === 'win32' ? 'python' : 'python3'),
    worker: path.join(input.repo, 'worker', 'main.py'),
    ffmpeg: input.env.FFMPEG_PATH || 'ffmpeg',
    ffprobe: input.env.FFPROBE_PATH || 'ffprobe',
  };
}

// A missing bundled file is a broken install; never fall back to system tools.
export function missingBundledPaths(
  paths: RuntimePaths,
  exists: (file: string) => boolean,
): string[] {
  return [paths.python, paths.worker, paths.ffmpeg, paths.ffprobe].filter((file) => !exists(file));
}
