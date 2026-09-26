import type { Platform } from './contracts.js';

// Facebook Page Reels and YouTube have implemented destinations; the seam is shared, not the adapters.
export function destinationAvailable(platform: Platform | string): boolean {
  return platform === 'facebook_page' || platform === 'youtube';
}
