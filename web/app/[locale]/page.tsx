import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { FaGithub } from 'react-icons/fa6';
import { LuLanguages, LuLaptop, LuLink, LuListVideo, LuPlus } from 'react-icons/lu';
import { AlphaContact } from '@/components/AlphaContact';
import { AlphaStage } from '@/components/AlphaStage';
import { DownloadButtons } from '@/components/DownloadButtons';
import { FloatingContact } from '@/components/FloatingContact';
import { SiteHeader } from '@/components/SiteHeader';
import { contactLinks } from '@/lib/contact';
import { getDownloadHref } from '@/lib/downloads';
import { isLocale, type Locale, messages } from '@/lib/i18n';
import { getSiteUrl } from '@/lib/site';

type Params = Promise<{ locale: string }>;

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'vi' }];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) return {};
  const copy = messages[rawLocale];

  return {
    title: copy.meta.title,
    description: copy.meta.description,
    alternates: {
      canonical: `/${rawLocale}`,
      languages: { vi: '/vi', en: '/en', 'x-default': '/vi' },
    },
    openGraph: {
      title: copy.meta.title,
      description: copy.meta.description,
      siteName: 'Reupmatic',
      url: `/${rawLocale}`,
      type: 'website',
      locale: rawLocale === 'vi' ? 'vi_VN' : 'en_US',
      alternateLocale: rawLocale === 'vi' ? ['en_US'] : ['vi_VN'],
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
      title: copy.meta.title,
      description: copy.meta.description,
      images: ['/og.png'],
    },
  };
}

export default async function Home({ params }: { params: Params }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const copy = messages[locale];
  const macHref = getDownloadHref('mac', process.env.NEXT_PUBLIC_MAC_DOWNLOAD_URL);
  const windowsHref = getDownloadHref('windows', process.env.NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL);
  const siteUrl = getSiteUrl();
  const valueIcons = [LuListVideo, LuLanguages, LuLaptop, LuLink];
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        url: siteUrl,
        name: 'Reupmatic',
        description: copy.meta.description,
        inLanguage: locale === 'vi' ? 'vi-VN' : 'en-US',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${siteUrl}/#app`,
        name: 'Reupmatic',
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'macOS, Windows',
        softwareVersion: 'Alpha',
        isAccessibleForFree: true,
        url: `${siteUrl}/${locale}`,
        description: copy.meta.description,
        inLanguage: locale === 'vi' ? 'vi-VN' : 'en-US',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: 'Free during Alpha',
        },
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      <a className="skip-link" href="#main-content">
        {copy.nav.skip}
      </a>
      <SiteHeader locale={locale} labels={copy.nav} />

      <main id="main-content">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="alpha-status">
              <i aria-hidden="true" />
              {copy.hero.status}
            </p>
            <h1 id="hero-title">{copy.hero.title}</h1>
            <p className="hero-body">{copy.hero.body}</p>
            <a className="primary-cta" href="#download">
              {copy.hero.cta}
            </a>
            <small>{copy.hero.note}</small>
          </div>
          <div className="hero-stage-wrap">
            <AlphaStage copy={copy.stage} />
          </div>
        </section>

        <section className="value-section" aria-labelledby="value-title">
          <div className="section-intro">
            <h2 id="value-title">{copy.value.title}</h2>
            <p>{copy.value.body}</p>
          </div>
          <div className="value-list">
            {copy.value.items.map(([title, body], index) => {
              const Icon = valueIcons[index];
              return (
                <article key={title}>
                  <Icon aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="alpha-section" id="alpha" aria-labelledby="alpha-title">
          <div className="alpha-intro">
            <h2 id="alpha-title">{copy.alpha.title}</h2>
            <p>{copy.alpha.body}</p>
          </div>
          <div className="alpha-columns">
            <section className="alpha-now">
              <h3>
                <i aria-hidden="true" />
                {copy.alpha.now}
              </h3>
              <ul>
                {copy.alpha.nowItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section className="alpha-next">
              <h3>{copy.alpha.next}</h3>
              <ul>
                {copy.alpha.nextItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
          <p className="alpha-note">{copy.alpha.note}</p>
        </section>

        <section className="faq-section" aria-labelledby="faq-title">
          <div className="faq-intro">
            <h2 id="faq-title">{copy.faq.title}</h2>
            <p>{copy.faq.body}</p>
          </div>
          <div className="faq-list">
            {copy.faq.items.map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>
                  <span>{question}</span>
                  <LuPlus aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="download-section" id="download" aria-labelledby="download-title">
          <div className="download-copy">
            <h2 id="download-title">{copy.download.title}</h2>
            <p>{copy.download.body}</p>
            <DownloadButtons
              macHref={macHref}
              windowsHref={windowsHref}
              macLabel={copy.download.mac}
              windowsLabel={copy.download.windows}
              macNote={copy.download.macNote}
              windowsNote={copy.download.windowsNote}
            />
            <small>{copy.download.note}</small>
          </div>
          <AlphaContact copy={copy.contact} />
        </section>
      </main>

      <footer className="site-footer">
        <a className="footer-brand" href={`/${locale}#top`} aria-label={copy.nav.home}>
          <Image src="/brand/logo.svg" alt="" width={26} height={26} />
          <span>Reupmatic</span>
        </a>
        <a href="https://canhta.com" target="_blank" rel="noreferrer">
          {copy.footer.maker}
        </a>
        <a className="footer-github" href={contactLinks.github} target="_blank" rel="noreferrer">
          <FaGithub aria-hidden="true" />
          <span>GitHub</span>
        </a>
        <a href={contactLinks.email}>{contactLinks.email.replace('mailto:', '')}</a>
        <span>© 2026</span>
      </footer>

      <FloatingContact
        zaloLabel={copy.contact.zalo}
        emailLabel={copy.contact.email}
        emailSubject={copy.contact.emailSubject}
      />
    </>
  );
}
