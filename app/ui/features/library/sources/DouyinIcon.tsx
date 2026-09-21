import type { SVGProps } from 'react';

/**
 * A generic music-note glyph standing in for Douyin's mark. This is original artwork rather than
 * the trademarked Douyin logo asset — monochrome and stroke-based to sit with the design system's
 * icon set — so it can be swapped for a licensed icon later without touching any caller.
 */
export function DouyinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  );
}
