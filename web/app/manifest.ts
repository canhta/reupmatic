import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Reupmatic',
    short_name: 'Reupmatic',
    description:
      'Batch video prep for Douyin reuploads: subtitles, Vietnamese voice and affiliate links, on your own computer.',
    lang: 'vi',
    start_url: '/',
    display: 'browser',
    background_color: '#f1f3f8',
    theme_color: '#f3f5fa',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
