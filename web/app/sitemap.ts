import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const languages = {
    vi: `${base}/vi`,
    en: `${base}/en`,
    'x-default': `${base}/vi`,
  };

  return [
    {
      url: `${base}/vi`,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: { languages },
    },
    {
      url: `${base}/en`,
      changeFrequency: 'weekly',
      priority: 0.9,
      alternates: { languages },
    },
  ];
}
