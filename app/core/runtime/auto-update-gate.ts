/**
 * Whether this run may check the release feed for updates. Only a packaged, installed app does:
 * a dev run (or any build pointed at the Vite dev server) must never auto-update, or it would
 * replace the checkout under the developer. Kept pure so it is asserted at the core boundary
 * rather than only inside Electron.
 */
export function shouldCheckForUpdates(input: {
  packaged: boolean;
  devServerUrl?: string | undefined;
}): boolean {
  return input.packaged && !input.devServerUrl;
}
