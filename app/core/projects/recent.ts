export type RecentKind = 'video' | 'project';

export interface RecentEntry {
  kind: RecentKind;
  id: string;
  name: string;
  path: string;
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

// A corrupt or foreign file reads as empty.
export function parseRecentEntries(value: unknown): RecentEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isEntry).slice(0, MAX_ENTRIES);
}

export function withRecentEntry(list: RecentEntry[], entry: RecentEntry): RecentEntry[] {
  const rest = list.filter((item) => !(item.kind === entry.kind && item.id === entry.id));
  return [entry, ...rest].slice(0, MAX_ENTRIES);
}
