import { LuMail } from 'react-icons/lu';
import { SiZalo } from 'react-icons/si';
import { contactLinks } from '@/lib/contact';

type Copy = {
  title: string;
  body: string;
  zalo: string;
  email: string;
  emailSubject: string;
};

export function AlphaContact({ copy }: { copy: Copy }) {
  return (
    <aside className="alpha-contact" aria-labelledby="alpha-contact-title">
      <div>
        <strong id="alpha-contact-title">{copy.title}</strong>
        <p>{copy.body}</p>
      </div>
      <div className="alpha-contact-links">
        <a href={contactLinks.zalo} target="_blank" rel="noreferrer">
          <SiZalo aria-hidden="true" />
          {copy.zalo}
        </a>
        <a href={`${contactLinks.email}?subject=${encodeURIComponent(copy.emailSubject)}`}>
          <LuMail aria-hidden="true" />
          {copy.email}
        </a>
      </div>
    </aside>
  );
}
