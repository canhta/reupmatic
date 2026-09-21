import { NextResponse } from 'next/server';
import {
  getDownloadPlatform,
  PLATFORM_ASSETS,
  RELEASE_API_URL,
  RELEASE_PAGE_URL,
} from '@/lib/downloads';

export const revalidate = 3600;

type ReleaseAsset = { name: string; browser_download_url: string };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform: segment } = await params;
  const platform = getDownloadPlatform(segment);
  if (!platform) return NextResponse.redirect(RELEASE_PAGE_URL, 302);

  try {
    const response = await fetch(RELEASE_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate },
    });
    if (response.ok) {
      const release = (await response.json()) as { assets?: ReleaseAsset[] };
      const assets = release.assets ?? [];
      for (const pattern of PLATFORM_ASSETS[platform]) {
        const asset = assets.find((candidate) => pattern.test(candidate.name));
        if (asset) {
          return NextResponse.redirect(asset.browser_download_url, {
            status: 302,
            headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
          });
        }
      }
    }
  } catch {
    // A failed lookup still sends the visitor somewhere useful: the release page.
  }

  return NextResponse.redirect(RELEASE_PAGE_URL, 302);
}
