import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import { isLocale } from '@/lib/i18n';
import { getSiteUrl } from '@/lib/site';
import '../site.css';

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: 'Reupmatic',
  title: 'Reupmatic',
  description:
    'Prepare batches of Douyin videos locally with subtitles, Vietnamese voice and affiliate links.',
  keywords: [
    'Douyin',
    'reup',
    'reup video',
    'video Douyin',
    'phụ đề',
    'giọng Việt',
    'affiliate',
    'macOS',
    'Windows',
  ],
  authors: [{ name: 'Cảnh Tạ', url: 'https://canhta.com' }],
  creator: 'Cảnh Tạ',
  publisher: 'Cảnh Tạ',
  category: 'technology',
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    type: 'website',
    siteName: 'Reupmatic',
    locale: 'vi_VN',
    alternateLocale: ['en_US'],
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Reupmatic — batch video prep for Douyin reuploads',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: '#f3f5fa',
  colorScheme: 'light',
};

type Params = Promise<{ locale: string }>;

export default async function LocaleRootLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Params }>) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : 'en';

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
