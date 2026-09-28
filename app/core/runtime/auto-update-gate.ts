/** Only a packaged app may check the release feed; dev builds must never auto-update. */
export function shouldCheckForUpdates(input: {
  packaged: boolean;
  devServerUrl?: string | undefined;
}): boolean {
  return input.packaged && !input.devServerUrl;
}
