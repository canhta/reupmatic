import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function preferredLocale(header: string | null) {
  if (!header) return 'vi';

  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tagPart, ...params] = part.trim().split(';');
      const tag = tagPart.toLowerCase();
      const qParam = params.find((value) => value.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag, q: Number.isFinite(q) ? q : 0, index };
    })
    .filter(
      ({ tag }) => tag === 'en' || tag.startsWith('en-') || tag === 'vi' || tag.startsWith('vi-'),
    )
    .sort((a, b) => b.q - a.q || a.index - b.index);

  return ranked[0]?.tag.startsWith('en') ? 'en' : 'vi';
}

export function proxy(request: NextRequest) {
  const locale = preferredLocale(request.headers.get('accept-language'));
  return NextResponse.redirect(new URL(`/${locale}`, request.url));
}

export const config = {
  matcher: ['/'],
};
