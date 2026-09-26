import type { Platform } from './contracts.js';

// Only Facebook Page Reels has an implemented destination today; the seam is shared, not the adapters.
export function destinationAvailable(platform: Platform | string): boolean {
  return platform === 'facebook_page';
}
