'use client';

import { useData } from '@/lib/data-store';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { ResumoClient } from '@/app/(app)/resumo/resumo-client';
import { BacklogClient } from '@/app/(app)/backlog/backlog-client';

const TABS = ['/resumo', '/backlog'];
const THRESHOLD = 60;
const DURATION  = 220;
const EASE      = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
const MAIN_CLS  = 'app-main-mobile-safe max-w-[1320px] mx-auto px-4 py-6';

/**
 * Shell de abas mobile para admin: renderiza /resumo e /backlog lado-a-lado
 * em memória e desliza entre eles via CSS transform — sem router.push,
 * sem ghost vazio. O conteúdo real das duas abas é visível simultaneamente
 * durante o swipe. URL sincronizada via history.replaceState.
 *
 * Desktop: apenas renderiza children normalmente.
 * Interno / rotas não-tab: apenas renderiza children normalmente.
 */
export function MobileTabShell({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const { viewerRole } = useData();

  const isAdmin   = viewerRole === 'admin';
  const isTabRoute = TABS.some((t) => pathname.startsWith(t));

  const trackRef = useRef<HTMLDivElement>(null);
  const tabIdxRef = useRef(Math.max(0, TABS.findIndex((t) => pathname.startsWith(t))));

  // Refs de swipe — sem estado React para evitar re-renders durante touchmove
  const startX   = useRef<number | null>(null);
  const startY   = useRef<number | null>(null);
  const axis     = useRef<'h' | 'v' | null>(null);
  const dragging = useRef(false);
  const busy     = useRef(false);

  // Posição inicial antes do primeiro paint
  useLayoutEffect(() => {
    applyTrack(tabIdxRef.current, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza quando pathname muda por navegação externa (links, back button)
  useEffect(() => {
    const newIdx = TABS.findIndex((t) => pathname.startsWith(t));
    if (newIdx !== -1 && newIdx !== tabIdxRef.current) {
      tabIdxRef.current = newIdx;
      applyTrack(newIdx, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function applyTrack(idx: number, animated: boolean) {
    const el = trackRef.current;
    if (!el) return;
    const vw = window.innerWidth;
    el.style.transition = animated ? `transform ${DURATION}ms ${EASE}` : 'none';
    el.style.transform  = idx === 0 ? '' : `translateX(${-idx * vw}px)`;
  }

  function goTo(newIdx: number) {
    tabIdxRef.current = newIdx;
    applyTrack(newIdx, true);
    window.history.replaceState(null, '', TABS[newIdx]);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (busy.current) return;
    startX.current   = e.touches[0].clientX;
    startY.current   = e.touches[0].clientY;
    axis.current     = null;
    dragging.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current === null || busy.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current!;

    if (!axis.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    if (axis.current !== 'h') return;

    dragging.current = true;
    const vw   = window.innerWidth;
    const base = -tabIdxRef.current * vw;
    const el   = trackRef.current;
    if (el) {
      el.style.transition = 'none';
      el.style.transform  = `translateX(${base + dx}px)`;
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!dragging.current) { reset(); return; }
    const dx = e.changedTouches[0].clientX - startX.current!;
    reset();

    const n    = TABS.length;
    const next =
      dx < -THRESHOLD ? (tabIdxRef.current + 1) % n :
      dx >  THRESHOLD ? (tabIdxRef.current - 1 + n) % n :
      tabIdxRef.current;

    goTo(next);
  }

  function reset() {
    startX.current   = null;
    startY.current   = null;
    axis.current     = null;
    dragging.current = false;
  }

  // Desktop e rotas não-tab: comportamento normal
  if (!isAdmin || !isTabRoute) {
    return <main className={MAIN_CLS}>{children}</main>;
  }

  return (
    <>
      {/* Mobile: carrossel real com ambas as páginas renderizadas */}
      <div className="md:hidden overflow-x-hidden">
        <div
          ref={trackRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            display:    'flex',
            width:      `${TABS.length * 100}vw`,
            willChange: 'transform',
            touchAction: 'pan-y',
          }}
        >
          {TABS.map((tab, i) => (
            <div key={tab} style={{ width: '100vw', flex: '0 0 100vw', minWidth: 0 }}>
              <main className={MAIN_CLS}>
                {i === 0 ? <ResumoClient /> : <BacklogClient />}
              </main>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop: roteamento normal */}
      <main className={`hidden md:block ${MAIN_CLS}`}>{children}</main>
    </>
  );
}
