'use client';

/**
 * Captura automática de uso: início de sessão, troca de tela e cliques.
 * Eventos com significado de negócio (abrir task, comentar, timer, export,
 * bulk...) são disparados com `track()` nos próprios componentes.
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useData } from '@/lib/data-store';
import { ativarTelemetria, flushTelemetria, track } from '@/lib/telemetry';

const CLICAVEL =
  'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="radio"], [role="checkbox"], input[type="checkbox"], input[type="radio"], select, summary, label';

/** Rótulo legível do elemento clicado: data-track > aria-label > title > texto. */
function rotulo(el: Element): string {
  const h = el as HTMLElement;
  return (
    h.dataset?.track ||
    h.getAttribute('aria-label') ||
    h.getAttribute('title') ||
    (h.innerText || h.textContent || '').trim() ||
    (h as HTMLInputElement).name ||
    h.tagName.toLowerCase()
  );
}

export function TelemetryTracker() {
  const { currentPessoa } = useData();
  const pathname = usePathname();
  const iniciou = useRef(false);

  // Liga a telemetria quando a pessoa logada é conhecida
  useEffect(() => {
    const ok = !!currentPessoa?.id;
    ativarTelemetria(ok);
    if (!ok || iniciou.current) return;
    iniciou.current = true;
    let nova = false;
    try {
      nova = !sessionStorage.getItem('k360-sessao-iniciada');
      sessionStorage.setItem('k360-sessao-iniciada', '1');
    } catch {
      /* noop */
    }
    if (nova) {
      const pwa =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      track('session_start', {
        props: { pwa, largura: window.innerWidth, altura: window.innerHeight, toque: 'ontouchstart' in window },
      });
    }
  }, [currentPessoa?.id]);

  // Troca de tela
  useEffect(() => {
    if (!currentPessoa?.id) return;
    track('page_view');
  }, [pathname, currentPessoa?.id]);

  // Cliques (captura global) + envio ao esconder/fechar a aba
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const alvo = (e.target as Element | null)?.closest?.(CLICAVEL);
      if (!alvo || alvo.closest('[data-track-ignore]')) return;
      const area = (alvo.closest('[data-track-area]') as HTMLElement | null)?.dataset.trackArea;
      track('click', { alvo: rotulo(alvo), props: area ? { area } : {} });
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushTelemetria();
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  return null;
}
