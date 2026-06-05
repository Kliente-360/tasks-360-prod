'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { useData } from '@/lib/data-store';

const TABS_ADMIN = ['/resumo', '/backlog'];
const TABS_INTERNO = ['/backlog'];
const SWIPE_THRESHOLD = 60;

/**
 * Wrapper de swipe mobile tipo Gmail: o conteúdo segue o dedo enquanto
 * arrasta, anima a saída ao soltar (se passou o threshold) ou volta
 * com spring (se não passou). Só age nas rotas de aba mobile.
 *
 * touch-action: pan-y → browser gerencia scroll vertical normalmente;
 * o JS assume o horizontal sem conflito.
 */
export function SwipeNav({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { viewerRole } = useData();

  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const axis = useRef<'h' | 'v' | null>(null);
  const [offset, setOffset] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  const tabs = viewerRole === 'admin' ? TABS_ADMIN : TABS_INTERNO;
  const idx = tabs.findIndex((t) => pathname.startsWith(t));
  const onTab = idx !== -1;

  function onTouchStart(e: React.TouchEvent) {
    if (!onTab || transitioning) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axis.current = null;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current === null || startY.current === null || transitioning) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Trava o eixo na primeira movimentação clara
    if (!axis.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    if (axis.current !== 'h') return;

    // Rubber-band se não há aba nessa direção
    const canGoLeft = idx < tabs.length - 1;
    const canGoRight = idx > 0;
    const clamped = dx < 0 && !canGoLeft ? dx * 0.15
      : dx > 0 && !canGoRight ? dx * 0.15
      : dx;

    setOffset(clamped);
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current === null || axis.current !== 'h') {
      reset();
      return;
    }
    const dx = e.changedTouches[0].clientX - startX.current;
    reset();

    const next =
      dx < -SWIPE_THRESHOLD && idx < tabs.length - 1 ? idx + 1 :
      dx >  SWIPE_THRESHOLD && idx > 0                ? idx - 1 :
      null;

    if (next === null) {
      // Spring de volta
      setTransitioning(true);
      setOffset(0);
      setTimeout(() => setTransitioning(false), 280);
    } else {
      // Anima pra fora, navega, limpa
      setTransitioning(true);
      setOffset(dx < 0 ? -window.innerWidth : window.innerWidth);
      setTimeout(() => {
        router.push(tabs[next]);
        setOffset(0);
        setTransitioning(false);
      }, 220);
    }
  }

  function reset() {
    startX.current = null;
    startY.current = null;
    axis.current = null;
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        touchAction: onTab ? 'pan-y' : undefined,
        transform: offset !== 0 ? `translateX(${offset}px)` : undefined,
        transition: transitioning
          ? 'transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
          : undefined,
        willChange: offset !== 0 ? 'transform' : undefined,
      }}
    >
      {children}
    </div>
  );
}
