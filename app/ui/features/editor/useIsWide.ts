import { useEffect, useState } from 'react';

// The one number this breakpoint is defined from. editor.css's own inspector overlay-drawer
// media query mirrors it at `@media (max-width: 1199.98px)` — offset by 0.02px, not this same
// value, so the two queries never both match at exactly 1200px wide.
export const EDITOR_WIDE_BREAKPOINT = 1200;

/**
 * Tracks a `min-width` breakpoint so JS-driven chrome (the inspector's
 * resizable/collapsible outer region, EditorRegions.tsx) can step aside
 * below it and let the existing DetailSurface-style overlay-drawer CSS
 * (editor.css) own the inspector alone, instead of the two competing for
 * the same width.
 */
export function useIsWide(breakpoint: number): boolean {
  const [isWide, setIsWide] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= breakpoint,
  );
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const update = () => setIsWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [breakpoint]);
  return isWide;
}
