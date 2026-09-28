'use client';

import { useEffect, useState } from 'react';
import { LuMail } from 'react-icons/lu';
import { SiZalo } from 'react-icons/si';
import { contactLinks } from '@/lib/contact';

type Props = {
  zaloLabel: string;
  emailLabel: string;
  emailSubject: string;
};

/**
 * Floating Zalo and email buttons.
 *
 * They stay on screen until the page's own contact buttons are in view, then
 * fade out so the same two actions are never offered twice at once.
 */
export function FloatingContact({ zaloLabel, emailLabel, emailSubject }: Props) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const target = document.querySelector('.alpha-contact');
    if (!target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(([entry]) => setHidden(entry.isIntersecting), {
      threshold: 0,
      rootMargin: '0px 0px -10% 0px',
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`floating-contact${hidden ? ' is-hidden' : ''}`}
      aria-hidden={hidden || undefined}
    >
      <a
        href={contactLinks.zalo}
        target="_blank"
        rel="noreferrer"
        aria-label={zaloLabel}
        data-label={zaloLabel}
      >
        <SiZalo aria-hidden="true" />
      </a>
      <a
        href={`${contactLinks.email}?subject=${encodeURIComponent(emailSubject)}`}
        aria-label={emailLabel}
        data-label={emailLabel}
      >
        <LuMail aria-hidden="true" />
      </a>
    </div>
  );
}
