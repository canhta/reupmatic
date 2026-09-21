import path from 'node:path';

/** Everything the resolver needs, passed in so this stays a pure function a test can drive. */
export interface RuntimePathInput {
  /** `app.isPackaged`. */
  packaged: boolean;
  /** Repo root in dev, or `process.resourcesPath` when packaged: where worker/python/ffmpeg live. */
  resources: string;
  /** Repo root; in a packaged app this is the asar root, where the UI and catalogue live. */
  repo: string;
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  /** Whether the dev `.venv` interpreter exists. Consulted only when not packaged. */
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

/**
 * Where the host finds its interpreter, worker source and media tools. A packaged app bundles all
 * of them under `resources/` (the installer ships a relocatable Python and FFmpeg), while a dev run
 * uses the repo's `.venv`, `worker/` source and the tools on PATH or `PYTHON`/`FFMPEG_PATH`. The
 * two must not be mixed: a packaged app that silently fell back to a system `python3` would run a
 * different environment than the one tested.
 */
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

/** The bundled files a packaged app must find on disk. A missing one is a broken install, not a
 * reason to fall back to the machine's own tools. */
export function missingBundledPaths(
  paths: RuntimePaths,
  exists: (file: string) => boolean,
): string[] {
  return [paths.python, paths.worker, paths.ffmpeg, paths.ffprobe].filter((file) => !exists(file));
}
