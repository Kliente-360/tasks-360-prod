'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useRef } from 'react';
import { useData } from '@/lib/data-store';

const TABS_ADMIN  = ['/resumo', '/backlog'];
const TABS_INTERNO = ['/backlog'];
const THRESHOLD = 60;
const DURATION  = 230;
const EASE      = `cubic-bezier(0.25, 0.46, 0.45, 0.94)`;

/**
 * Swipe entre abas mobile sem re-render do React durante o arraste:
 * todo o movimento é feito via style direto no DOM (contentRef + ghostRef).
 * O ghost é um painel em branco que entra pelo lado oposto ao conteúdo —
 * dá a ilusão de dual-panel sem precisar renderizar a próxima página antes.
 */
export function SwipeNav({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { viewerRole } = useData();

  const outerRef   = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const ghostRef   = useRef<HTMLDivElement>(null);

  const startX  = useRef<number | null>(null);
  const startY  = useRef<number | null>(null);
  const axis    = useRef<'h' | 'v' | null>(null);
  const active  = useRef(false); // swipe horizontal em progresso
  const busy    = useRef(false); // animação de saída em curso

  const tabs  = viewerRole === 'admin' ? TABS_ADMIN : TABS_INTERNO;
  const idx   = tabs.findIndex((t) => pathname.startsWith(t));
  const onTab = idx !== -1 && tabs.length > 1;

  // ── helpers DOM ──────────────────────────────────────────

  function tx(el: HTMLElement | null, x: number, animated: boolean) {
    if (!el) return;
    el.style.transition = animated ? `transform ${DURATION}ms ${EASE}` : 'none';
    el.style.transform  = x !== 0 ? `translateX(${x}px)` : '';
  }

  function clip(on: boolean) {
    if (outerRef.current) outerRef.current.style.overflow = on ? 'hidden' : '';
  }

  function resetGhost() {
    const g = ghostRef.current;
    if (!g) return;
    g.style.display    = 'none';
    g.style.transform  = '';
    g.style.transition = 'none';
  }

  // ── handlers ─────────────────────────────────────────────

  function onTouchStart(e: React.TouchEvent) {
    if (!onTab || busy.current) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axis.current   = null;
    active.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current === null || busy.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current!;

    // Trava eixo na primeira movimentação clara
    if (!axis.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    if (axis.current !== 'h') return;

    if (!active.current) {
      active.current = true;
      clip(true); // evita que o ghost vaze além do wrapper
    }

    const vw = window.innerWidth;
    // Conteúdo segue o dedo
    tx(contentRef.current, dx, false);
    // Ghost vem do lado oposto
    const g = ghostRef.current;
    if (g) {
      g.style.display    = 'block';
      g.style.transition = 'none';
      g.style.transform  = `translateX(${(dx < 0 ? vw : -vw) + dx}px)`;
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!active.current) { reset(); return; }

    const dx  = e.changedTouches[0].clientX - startX.current!;
    const vw  = window.innerWidth;
    const g   = ghostRef.current;
    reset();

    const next =
      dx < -THRESHOLD ? (idx + 1) % tabs.length :
      dx >  THRESHOLD ? (idx - 1 + tabs.length) % tabs.length :
      null;

    if (next === null) {
      // Spring de volta: conteúdo retorna, ghost recua
      tx(contentRef.current, 0, true);
      if (g) {
        g.style.transition = `transform ${DURATION}ms ${EASE}`;
        g.style.transform  = `translateX(${dx < 0 ? vw : -vw}px)`;
      }
      setTimeout(() => { clip(false); resetGhost(); }, DURATION);
    } else {
      // Commit: conteúdo sai, ghost entra no centro → navega
      busy.current = true;
      tx(contentRef.current, dx < 0 ? -vw : vw, true);
      if (g) {
        g.style.transition = `transform ${DURATION}ms ${EASE}`;
        g.style.transform  = 'translateX(0)';
      }
      setTimeout(() => {
        router.push(tabs[next]);
        tx(contentRef.current, 0, false);
        clip(false);
        resetGhost();
        busy.current = false;
      }, DURATION);
    }
  }

  function reset() {
    startX.current = null;
    startY.current = null;
    axis.current   = null;
    active.current = false;
  }

  return (
    <div ref={outerRef} style={{ position: 'relative' }}>
      {/* Ghost — painel vazio que desliza pelo lado oposto ao conteúdo */}
      <div
        ref={ghostRef}
        style={{
          display: 'none',
          position: 'absolute',
          inset: 0,
          background: 'var(--bg)',
          zIndex: 10,
          willChange: 'transform',
        }}
      />
      <div
        ref={contentRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          touchAction: onTab ? 'pan-y' : undefined,
          willChange: 'transform',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
