// The header source switcher's Recent list is one place for videos, projects and recovered
// drafts (drafts come from the separate recovery store — see recovery/recovery-contracts.ts);
// this module owns only the non-draft half: opened videos and projects, most recent first.
export type RecentKind = 'video' | 'project';

export interface RecentEntry {
  kind: RecentKind;
  /** For a video: the registered asset id. For a project: the project file's own id
   * (its saved `id` field), stable across relaunches even if the file moves. */
  id: string;
  name: string;
  /** The video/project file's canonical filesystem path — reopening a Recent entry loads
   * straight from this path, no picker (mirrors the open dialog's own validation). */
  path: string;
  /** Set only for a project entry: the source video's own path, captured at save/open time,
   * so reopening a project from Recent needs no second "choose the source video" dialog when
   * that video is still where the project last saw it. */
  source_path?: string;
  opened_at: number;
}

const MAX_ENTRIES = 8;

function isRecentKind(value: unknown): value is RecentKind {
  return value === 'video' || value === 'project';
}

function isEntry(value: unknown): value is RecentEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  const allowed = ['kind', 'id', 'name', 'path', 'source_path', 'opened_at'];
  if (keys.some((key) => !allowed.includes(key))) return false;
  return (
    isRecentKind(v.kind) &&
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.name === 'string' &&
    typeof v.path === 'string' &&
    v.path.length > 0 &&
    (v.source_path === undefined || typeof v.source_path === 'string') &&
    typeof v.opened_at === 'number' &&
    Number.isFinite(v.opened_at)
  );
}

/** Tolerant parse: a corrupt or foreign recent-items file reads as empty rather than failing the
 * whole switcher — this is a convenience list, not data anything else depends on. */
export function parseRecentEntries(value: unknown): RecentEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isEntry).slice(0, MAX_ENTRIES);
}

/** Moves `entry` to the front, de-duplicated by kind+id, capped at MAX_ENTRIES. */
export function withRecentEntry(list: RecentEntry[], entry: RecentEntry): RecentEntry[] {
  const rest = list.filter((item) => !(item.kind === entry.kind && item.id === entry.id));
  return [entry, ...rest].slice(0, MAX_ENTRIES);
}
