'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useRef } from 'react';
import { useData } from '@/lib/data-store';

const TABS_ADMIN = ['/resumo', '/backlog'];
const TABS_INTERNO = ['/backlog'];
const SWIPE_THRESHOLD = 60;

/**
 * Wrapper invisível (display:contents) que detecta swipe horizontal no mobile
 * e navega entre as abas /resumo ↔ /backlog, como o Gmail mobile.
 * Só age quando a rota atual é uma das abas mobile — não interfere em outras páginas.
 */
export function SwipeNav({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { viewerRole } = useData();
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  const tabs = viewerRole === 'admin' ? TABS_ADMIN : TABS_INTERNO;

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current === null || startY.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = e.changedTouches[0].clientY - startY.current;
    startX.current = null;
    startY.current = null;

    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;

    const idx = tabs.findIndex((t) => pathname.startsWith(t));
    if (idx === -1) return;

    if (dx < 0 && idx < tabs.length - 1) router.push(tabs[idx + 1]);
    else if (dx > 0 && idx > 0) router.push(tabs[idx - 1]);
  }

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
