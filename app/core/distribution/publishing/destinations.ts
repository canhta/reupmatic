import type { Platform } from './contracts.js';

// Facebook Page Reels, YouTube and TikTok have implemented destinations; the seam, not the adapter.
export function destinationAvailable(platform: Platform | string): boolean {
  return platform === 'facebook_page' || platform === 'youtube' || platform === 'tiktok';
}
