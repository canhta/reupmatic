const RELEASE_REPO = 'canhta/reupmatic';

export const RELEASE_PAGE_URL = `https://github.com/${RELEASE_REPO}/releases`;
/** The list endpoint, not `/releases/latest`: that one ignores pre-releases, which is all we have. */
export const RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_REPO}/releases?per_page=5`;

export type DownloadPlatform = 'mac' | 'windows';

/**
 * A stable site path, not a versioned asset URL: the route handler resolves it to whatever the
 * current GitHub release published, so a release never leaves the buttons pointing at a stale file.
 */
const PLATFORM_PATHS: Record<DownloadPlatform, string> = {
  mac: '/download/mac',
  windows: '/download/win',
};

/** Asset names electron-builder publishes, in the order a visitor should receive them. */
export const PLATFORM_ASSETS: Record<DownloadPlatform, RegExp[]> = {
  mac: [/\.dmg$/i, /\.zip$/i],
  windows: [/\.exe$/i, /\.msi$/i],
};

export function getDownloadHref(platform: DownloadPlatform, override?: string) {
  return override && override.trim().length > 0 ? override.trim() : PLATFORM_PATHS[platform];
}

export function getDownloadPlatform(segment: string): DownloadPlatform | undefined {
  if (segment === 'mac') return 'mac';
  if (segment === 'win' || segment === 'windows') return 'windows';
  return undefined;
}
