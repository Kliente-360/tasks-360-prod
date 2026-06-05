'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useData } from '@/lib/data-store';

const TABS_ADMIN   = ['/resumo', '/backlog'];
const TABS_INTERNO = ['/backlog'];
const THRESHOLD = 60;
const DURATION  = 220;
const EASE      = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

type EntryDir = 'from-right' | 'from-left';

/**
 * Swipe entre abas mobile com animação dupla:
 *   arraste  → conteúdo segue o dedo, ghost entra pelo lado oposto
 *   commit   → conteúdo sai, ghost cobre a tela enquanto nova página renderiza
 *   entrada  → nova página desliza de dentro do ghost (useEffect no pathname)
 *
 * Zero re-renders durante touchmove: todo movimento é via style direto no DOM.
 */
export function SwipeNav({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { viewerRole } = useData();

  const outerRef   = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const ghostRef   = useRef<HTMLDivElement>(null);

  const startX       = useRef<number | null>(null);
  const startY       = useRef<number | null>(null);
  const axis         = useRef<'h' | 'v' | null>(null);
  const dragging     = useRef(false);
  const busy         = useRef(false);
  const pendingEntry = useRef<EntryDir | null>(null);

  const tabs  = viewerRole === 'admin' ? TABS_ADMIN : TABS_INTERNO;
  const idx   = tabs.findIndex((t) => pathname.startsWith(t));
  const onTab = idx !== -1 && tabs.length > 1;

  // ── Quando pathname muda: nova página já renderizou — animar a entrada ──
  useEffect(() => {
    const entry = pendingEntry.current;
    if (!entry) return;
    pendingEntry.current = null;

    const el = contentRef.current;
    const g  = ghostRef.current;
    if (!el) return;

    // Posicionar novo conteúdo fora da tela no lado de onde vem
    const fromX = entry === 'from-right' ? window.innerWidth : -window.innerWidth;
    el.style.transition = 'none';
    el.style.transform  = `translateX(${fromX}px)`;

    // Dois rAFs garantem que o browser pintou a posição inicial antes de animar
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tx(el, 0, true);
        // Ghost faz fade-out enquanto o conteúdo desliza para dentro
        if (g) {
          g.style.transition = `opacity ${DURATION}ms ease-out`;
          g.style.opacity    = '0';
        }
        setTimeout(() => {
          resetGhost();
          clip(false);
          busy.current = false;
        }, DURATION);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ── Helpers DOM ───────────────────────────────────────────

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
    g.style.opacity    = '1';
  }

  // ── Touch handlers ────────────────────────────────────────

  function onTouchStart(e: React.TouchEvent) {
    if (!onTab || busy.current) return;
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

    if (!dragging.current) {
      dragging.current = true;
      clip(true);
    }

    const vw = window.innerWidth;
    tx(contentRef.current, dx, false);
    const g = ghostRef.current;
    if (g) {
      g.style.display    = 'block';
      g.style.transition = 'none';
      g.style.opacity    = '1';
      g.style.transform  = `translateX(${(dx < 0 ? vw : -vw) + dx}px)`;
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!dragging.current) { reset(); return; }
    const dx  = e.changedTouches[0].clientX - startX.current!;
    const vw  = window.innerWidth;
    const g   = ghostRef.current;
    reset();

    const next =
      dx < -THRESHOLD ? (idx + 1) % tabs.length :
      dx >  THRESHOLD ? (idx - 1 + tabs.length) % tabs.length :
      null;

    if (next === null) {
      // Spring de volta
      tx(contentRef.current, 0, true);
      if (g) {
        g.style.transition = `transform ${DURATION}ms ${EASE}`;
        g.style.transform  = `translateX(${dx < 0 ? vw : -vw}px)`;
      }
      setTimeout(() => { clip(false); resetGhost(); }, DURATION);
    } else {
      // Commit: conteúdo sai, ghost entra no centro → cobre tela durante router.push
      busy.current = true;
      pendingEntry.current = dx < 0 ? 'from-right' : 'from-left';

      tx(contentRef.current, dx < 0 ? -vw : vw, true);
      if (g) {
        g.style.transition = `transform ${DURATION}ms ${EASE}`;
        g.style.transform  = 'translateX(0)';
      }

      setTimeout(() => {
        // Ghost já cobre a tela — navegar enquanto nova página renderiza
        router.push(tabs[next]);
        // NÃO resetar aqui: useEffect([pathname]) cuida da animação de entrada
      }, DURATION);
    }
  }

  function reset() {
    startX.current   = null;
    startY.current   = null;
    axis.current     = null;
    dragging.current = false;
  }

  return (
    <div ref={outerRef} style={{ position: 'relative' }}>
      {/* Ghost — cobre a tela enquanto a nova página renderiza */}
      <div
        ref={ghostRef}
        style={{
          display:    'none',
          position:   'absolute',
          inset:      0,
          background: 'var(--bg)',
          zIndex:     10,
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
          willChange:  'transform',
          position:    'relative',
          zIndex:      1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
