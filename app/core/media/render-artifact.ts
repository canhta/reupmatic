import path from 'node:path';

export function renderArtifactPath(workspace: string, id: unknown, filename: unknown): string {
  if (
    typeof id !== 'string' ||
    typeof filename !== 'string' ||
    filename.includes('\0') ||
    !path.isAbsolute(filename)
  )
    throw new Error('INVALID_WORKER_RESPONSE');
  const root = path.resolve(workspace, 'renders');
  let allowed: string[];
  if (/^[a-f0-9]{64}$/.test(id)) {
    allowed = ['output.mp4', 'output.mkv'].map((name) => path.join(root, id, name));
  } else if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) {
    allowed = [path.join(root, `${id}.mp4`)];
  } else throw new Error('INVALID_WORKER_RESPONSE');
  if (!allowed.includes(path.resolve(filename)) || path.normalize(filename) !== filename) {
    throw new Error('INVALID_WORKER_RESPONSE');
  }
  return filename;
}
