'use client';

import { useEffect, useState } from 'react';
import type { IconType } from 'react-icons';
import { FaApple, FaWindows } from 'react-icons/fa6';
import { LuDownload } from 'react-icons/lu';

type Platform = 'mac' | 'windows';

type Props = {
  macHref?: string;
  windowsHref?: string;
  macLabel: string;
  windowsLabel: string;
  macNote: string;
  windowsNote: string;
};

type ButtonProps = {
  href?: string;
  icon: IconType;
  label: string;
  note: string;
  preferred: boolean;
};

function PlatformButton({ href, icon: Icon, label, note, preferred }: ButtonProps) {
  const className = `platform-button${preferred ? ' is-preferred' : ''}${href ? '' : ' is-disabled'}`;
  const body = (
    <>
      <Icon aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        <small>{note}</small>
      </span>
      <LuDownload aria-hidden="true" />
    </>
  );

  if (!href) {
    return (
      <button className={className} type="button" disabled aria-label={label}>
        {body}
      </button>
    );
  }

  return (
    <a className={className} href={href} aria-label={`${label}. ${note}`}>
      {body}
    </a>
  );
}

export function DownloadButtons({
  macHref,
  windowsHref,
  macLabel,
  windowsLabel,
  macNote,
  windowsNote,
}: Props) {
  const [preferred, setPreferred] = useState<Platform | null>(null);

  useEffect(() => {
    const platform = `${navigator.platform || ''} ${navigator.userAgent || ''}`;
    if (/Windows/i.test(platform)) setPreferred('windows');
    else if (/Macintosh|MacIntel/i.test(platform) && !/iPhone|iPad|iPod/i.test(platform))
      setPreferred('mac');
  }, []);

  return (
    <div className="download-buttons">
      <PlatformButton
        href={macHref}
        icon={FaApple}
        label={macLabel}
        note={macNote}
        preferred={preferred === 'mac' && Boolean(macHref)}
      />
      <PlatformButton
        href={windowsHref}
        icon={FaWindows}
        label={windowsLabel}
        note={windowsNote}
        preferred={preferred === 'windows' && Boolean(windowsHref)}
      />
    </div>
  );
}
