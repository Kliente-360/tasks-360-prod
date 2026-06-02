'use client';

import { useEffect, useRef } from 'react';

/**
 * Detecta clique fora do elemento ref. Usado em popovers de FilterSelect,
 * MoreMenu, dropdowns em geral.
 *
 *   const ref = useClickAway(() => setOpen(false));
 *   <div ref={ref}>…</div>
 */
export function useClickAway<T extends HTMLElement = HTMLDivElement>(
  onAway: () => void,
) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const h = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onAway();
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('touchstart', h);
    };
  }, [onAway]);
  return ref;
}
