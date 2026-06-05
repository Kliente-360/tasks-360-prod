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
 * Carrossel circular de 2 abas para admin em mobile.
 *
 * Arquitetura: 2 slots reais (Resumo + Backlog) com posicionamento absoluto/relativo.
 * Em repouso: tab ativa = position:relative (altura natural no flow), tab oculta =
 * position:absolute off-screen + visibility:hidden → não contribui pro scroll do body.
 * Durante swipe: ambos vão pra absolute, stage recebe altura explícita; animação por
 * transform. Após commit: volta ao repouso com nova tab ativa.
 *
 * Circular: a tab oculta é reposicionada para o lado correto no início do arraste.
 * Zero React state durante o toque — tudo via style direto nos refs.
 * URL sincronizada via history.replaceState. Scroll resetado ao trocar aba.
 *
 * Desktop / rotas não-tab: renderiza children normalmente.
 */
export function MobileTabShell({ children }: { children: React.ReactNode }) {
  const pathname       = usePathname();
  const { viewerRole } = useData();

  const isAdmin    = viewerRole === 'admin';
  const isTabRoute = TABS.some((t) => pathname.startsWith(t));

  const stageRef = useRef<HTMLDivElement>(null);
  // slot 0 = Resumo, slot 1 = Backlog
  const slot0Ref = useRef<HTMLDivElement>(null);
  const slot1Ref = useRef<HTMLDivElement>(null);
  const idxRef   = useRef(Math.max(0, TABS.findIndex((t) => pathname.startsWith(t))));

  const startX    = useRef<number | null>(null);
  const startY    = useRef<number | null>(null);
  const axis      = useRef<'h' | 'v' | null>(null);
  const dragging  = useRef(false);
  const busy      = useRef(false);
  const swipeDir  = useRef<1 | -1>(1); // 1=swipe right, -1=swipe left

  function slotRef(i: number) { return i === 0 ? slot0Ref : slot1Ref; }

  // Repouso: tab ativa em flow (relative), outra fora do flow (absolute + hidden)
  function applyRest(idx: number) {
    const cur = slotRef(idx).current;
    const oth = slotRef(1 - idx).current;
    if (!cur || !oth) return;
    const W = window.innerWidth;

    cur.style.cssText = 'position:relative;';

    oth.style.position   = 'absolute';
    oth.style.top        = '0';
    oth.style.left       = '0';
    oth.style.width      = `${W}px`;
    oth.style.transform  = `translateX(${W}px)`;   // off-screen right (default)
    oth.style.visibility = 'hidden';
    oth.style.transition = '';
  }

  useLayoutEffect(() => {
    applyRest(idxRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const newIdx = TABS.findIndex((t) => pathname.startsWith(t));
    if (newIdx !== -1 && newIdx !== idxRef.current) {
      idxRef.current = newIdx;
      applyRest(newIdx);
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

    const cur = slotRef(idxRef.current).current;
    const oth = slotRef(1 - idxRef.current).current;
    if (!cur || !oth) return;
    const W = window.innerWidth;

    if (!dragging.current) {
      dragging.current = true;
      swipeDir.current  = dx > 0 ? 1 : -1;

      // Salva altura do stage antes de soltar o flow
      const stage = stageRef.current;
      if (stage) stage.style.height = `${stage.offsetHeight}px`;

      // Ambos vão pra absolute
      cur.style.position   = 'absolute';
      cur.style.top        = '0';
      cur.style.left       = '0';
      cur.style.width      = `${W}px`;
      cur.style.visibility = 'visible';

      // Posiciona a outra aba no lado correto p/ a direção do swipe
      oth.style.transform  = `translateX(${dx > 0 ? -W : W}px)`;
      oth.style.visibility = 'visible';
    }

    cur.style.transition = 'none';
    cur.style.transform  = `translateX(${dx}px)`;
    oth.style.transition = 'none';
    oth.style.transform  = `translateX(${(swipeDir.current > 0 ? -W : W) + dx}px)`;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!dragging.current) { reset(); return; }
    const dx = e.changedTouches[0].clientX - startX.current!;
    reset();

    const cur = slotRef(idxRef.current).current;
    const oth = slotRef(1 - idxRef.current).current;
    if (!cur || !oth) return;
    const W   = window.innerWidth;
    const anim = `transform ${DURATION}ms ${EASE}`;

    if (Math.abs(dx) < THRESHOLD) {
      // Spring de volta
      cur.style.transition = anim;
      cur.style.transform  = '';
      oth.style.transition = anim;
      oth.style.transform  = `translateX(${swipeDir.current > 0 ? -W : W}px)`;
      setTimeout(() => {
        applyRest(idxRef.current);
        const stage = stageRef.current;
        if (stage) stage.style.height = '';
      }, DURATION);
      return;
    }

    // Commit: tab atual sai, outra entra
    busy.current = true;
    const newIdx = 1 - idxRef.current;
    const dir    = dx > 0 ? 1 : -1;

    window.scrollTo({ top: 0, behavior: 'instant' });

    cur.style.transition = anim;
    cur.style.transform  = `translateX(${dir * W}px)`;
    oth.style.transition = anim;
    oth.style.transform  = '';

    setTimeout(() => {
      idxRef.current = newIdx;
      window.history.replaceState(null, '', TABS[newIdx]);
      applyRest(newIdx);
      const stage = stageRef.current;
      if (stage) stage.style.height = '';
      busy.current = false;
    }, DURATION);
  }

  function reset() {
    startX.current   = null;
    startY.current   = null;
    axis.current     = null;
    dragging.current = false;
  }

  if (!isAdmin || !isTabRoute) {
    return <main className={MAIN_CLS}>{children}</main>;
  }

  return (
    <>
      {/* Mobile: 2 slots, apenas o ativo está no flow (altura correta no body) */}
      <div
        ref={stageRef}
        className="md:hidden"
        style={{ position: 'relative', overflow: 'hidden' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div ref={slot0Ref} style={{ touchAction: 'pan-y', willChange: 'transform' }}>
          <main className={MAIN_CLS}><ResumoClient /></main>
        </div>
        <div ref={slot1Ref} style={{ touchAction: 'pan-y', willChange: 'transform' }}>
          <main className={MAIN_CLS}><BacklogClient /></main>
        </div>
      </div>

      {/* Desktop: roteamento normal */}
      <main className={`hidden md:block ${MAIN_CLS}`}>{children}</main>
    </>
  );
}
