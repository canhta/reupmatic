import { useEffect, useState } from 'react';

// editor.css mirrors this at max-width: 1199.98px (0.02px offset so both never match).
export const EDITOR_WIDE_BREAKPOINT = 1200;

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
