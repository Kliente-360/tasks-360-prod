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
 * Carrossel infinito de 2 abas para admin em mobile.
 *
 * Track de 4 slots: [Backlog · Resumo · Backlog · Resumo]
 * Posições canônicas (translateX):
 *   Resumo  (idx=0) → -1×vw  (slot 1)
 *   Backlog (idx=1) → -2×vw  (slot 2)
 *
 * Todo swipe anima para o slot adjacente (±1 vw do canônico).
 * Após a animação, um snap sem transição volta para a posição canônica
 * do novo tab — invisível pois os slots clones têm conteúdo idêntico e
 * o scroll do body é compartilhado entre todas as instâncias.
 *
 * Zero React state durante o swipe: tudo via style direto no DOM.
 * URL sincronizada via history.replaceState.
 *
 * Desktop / rotas não-tab: renderiza children normalmente.
 */
export function MobileTabShell({ children }: { children: React.ReactNode }) {
  const pathname       = usePathname();
  const { viewerRole } = useData();

  const isAdmin    = viewerRole === 'admin';
  const isTabRoute = TABS.some((t) => pathname.startsWith(t));

  const trackRef = useRef<HTMLDivElement>(null);
  const idxRef   = useRef(Math.max(0, TABS.findIndex((t) => pathname.startsWith(t))));

  const startX   = useRef<number | null>(null);
  const startY   = useRef<number | null>(null);
  const axis     = useRef<'h' | 'v' | null>(null);
  const dragging = useRef(false);
  const busy     = useRef(false);

  // Posição canônica em px: Resumo(0)→-vw, Backlog(1)→-2vw
  function canonical(idx: number) {
    return -(idx + 1) * window.innerWidth;
  }

  function setTrack(px: number, animated: boolean) {
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = animated ? `transform ${DURATION}ms ${EASE}` : 'none';
    el.style.transform  = `translateX(${px}px)`;
  }

  // Posição inicial antes do primeiro paint
  useLayoutEffect(() => {
    setTrack(canonical(idxRef.current), false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza quando pathname muda por navegação externa
  useEffect(() => {
    const newIdx = TABS.findIndex((t) => pathname.startsWith(t));
    if (newIdx !== -1 && newIdx !== idxRef.current) {
      idxRef.current = newIdx;
      setTrack(canonical(newIdx), false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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
    const el = trackRef.current;
    if (el) {
      el.style.transition = 'none';
      el.style.transform  = `translateX(${canonical(idxRef.current) + dx}px)`;
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!dragging.current) { reset(); return; }
    const dx = e.changedTouches[0].clientX - startX.current!;
    reset();

    const base = canonical(idxRef.current);

    if (Math.abs(dx) < THRESHOLD) {
      setTrack(base, true);
      return;
    }

    // Commit: anima para o slot adjacente, depois snap para posição canônica
    busy.current = true;
    const n      = TABS.length;
    const newIdx = dx < 0
      ? (idxRef.current + 1) % n
      : (idxRef.current - 1 + n) % n;

    // Zera scroll antes da animação: destino sempre chega no topo
    window.scrollTo({ top: 0, behavior: 'instant' });
    setTrack(dx < 0 ? base - window.innerWidth : base + window.innerWidth, true);

    setTimeout(() => {
      idxRef.current = newIdx;
      window.history.replaceState(null, '', TABS[newIdx]);
      // Snap invisível: slots clones têm conteúdo idêntico
      setTrack(canonical(newIdx), false);
      busy.current = false;
    }, DURATION);
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
      {/* Mobile: 4-slot circular carousel [Backlog · Resumo · Backlog · Resumo] */}
      <div className="md:hidden overflow-x-hidden">
        <div
          ref={trackRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            display:     'flex',
            width:       '400vw',
            willChange:  'transform',
            touchAction: 'pan-y',
          }}
        >
          {/* Slot 0 · Backlog clone (borda esquerda para swipe circular vindo do Resumo) */}
          <div style={{ width: '100vw', flex: '0 0 100vw', minWidth: 0 }}>
            <main className={MAIN_CLS}><BacklogClient /></main>
          </div>
          {/* Slot 1 · Resumo canônico */}
          <div style={{ width: '100vw', flex: '0 0 100vw', minWidth: 0 }}>
            <main className={MAIN_CLS}><ResumoClient /></main>
          </div>
          {/* Slot 2 · Backlog canônico */}
          <div style={{ width: '100vw', flex: '0 0 100vw', minWidth: 0 }}>
            <main className={MAIN_CLS}><BacklogClient /></main>
          </div>
          {/* Slot 3 · Resumo clone (borda direita para swipe circular vindo do Backlog) */}
          <div style={{ width: '100vw', flex: '0 0 100vw', minWidth: 0 }}>
            <main className={MAIN_CLS}><ResumoClient /></main>
          </div>
        </div>
      </div>

      {/* Desktop: roteamento normal */}
      <main className={`hidden md:block ${MAIN_CLS}`}>{children}</main>
    </>
  );
}
