import { contactLinks } from '@/lib/contact';
import { messages } from '@/lib/i18n';
import { getSiteUrl } from '@/lib/site';

export const dynamic = 'force-static';

export function GET() {
  const site = getSiteUrl();
  const en = messages.en;

  const lines = [
    '# Reupmatic',
    '',
    `> ${en.meta.description}`,
    '',
    `Free while in Alpha. Available for macOS and Windows. The current build does`,
    `not publish to social accounts yet; planned times and channel details are`,
    `saved as local drafts.`,
    '',
    '## What it does',
    '',
    ...en.value.items.map(([title, body]) => `- **${title}** — ${body}`),
    '',
    '## Working now',
    '',
    ...en.alpha.nowItems.map((item) => `- ${item}`),
    '',
    '## Still being built',
    '',
    ...en.alpha.nextItems.map((item) => `- ${item}`),
    '',
    '## Links',
    '',
    `- Site (English): ${site}/en`,
    `- Site (Vietnamese): ${site}/vi`,
    `- Support group: ${contactLinks.zalo}`,
    `- Email: ${contactLinks.email.replace('mailto:', '')}`,
    '',
    '---',
    '',
    'Generated from the site content. Nothing here is a claim that cannot be',
    'checked against the links above.',
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
