import { FaGithub } from 'react-icons/fa6';
import { contactLinks } from '@/lib/contact';
import type { Locale } from '@/lib/i18n';

type Labels = {
  alpha: string;
  support: string;
  download: string;
  language: string;
  home: string;
  primaryNavigation: string;
};

export function SiteHeader({ locale, labels }: { locale: Locale; labels: Labels }) {
  return (
    <header className="site-header">
      <a className="site-brand" href={`/${locale}#top`} aria-label={labels.home}>
        <span>Reupmatic</span>
      </a>

      <nav className="site-nav" aria-label={labels.primaryNavigation}>
        <a href={`/${locale}#alpha`}>{labels.alpha}</a>
        <a href={contactLinks.zalo} target="_blank" rel="noreferrer">
          {labels.support}
        </a>
      </nav>

      <div className="header-actions">
        <a
          className="header-github"
          href={contactLinks.github}
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
        >
          <FaGithub aria-hidden="true" />
        </a>
        <nav className="locale-switch" aria-label={labels.language}>
          <a
            className={locale === 'vi' ? 'is-active' : ''}
            aria-current={locale === 'vi' ? 'page' : undefined}
            href="/vi"
            lang="vi"
          >
            VI
          </a>
          <span aria-hidden="true">/</span>
          <a
            className={locale === 'en' ? 'is-active' : ''}
            aria-current={locale === 'en' ? 'page' : undefined}
            href="/en"
            lang="en"
          >
            EN
          </a>
        </nav>
        <a className="header-download" href={`/${locale}#download`}>
          {labels.download}
        </a>
      </div>
    </header>
  );
}
