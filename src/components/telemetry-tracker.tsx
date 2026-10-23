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

/** Texto de um <label> sem o texto dos campos que ele envolve. */
function textoDoLabel(lbl: HTMLLabelElement): string {
  const c = lbl.cloneNode(true) as HTMLElement;
  c.querySelectorAll('select, input, textarea, option').forEach((n) => n.remove());
  return (c.textContent || '').trim();
}

/** Rótulo de um campo (select/input): aria-label > <label for> > label
 *  envolvente > rótulo da linha (.lbl/.rt) > name. Nunca o texto das opções. */
function rotuloDoCampo(h: HTMLElement): string {
  const aria = h.getAttribute('aria-label') || h.getAttribute('title');
  if (aria) return aria;
  if (h.id) {
    const lbl = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(h.id)}"]`);
    if (lbl) return textoDoLabel(lbl);
  }
  const envolvente = h.closest('label');
  if (envolvente) {
    const t = textoDoLabel(envolvente);
    if (t) return t;
  }
  const bloco = h.closest('div');
  const proximo = bloco?.querySelector('.lbl, .rt, label');
  if (proximo && proximo !== h) {
    const t = (proximo.textContent || '').trim();
    if (t) return t;
  }
  return (h as HTMLInputElement).name || h.tagName.toLowerCase();
}

/** Rótulo legível do elemento clicado: data-track > campo > aria-label > title > texto. */
function rotulo(el: Element): string {
  const h = el as HTMLElement;
  if (h.dataset?.track) return h.dataset.track;
  const tag = h.tagName;
  if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return 'campo: ' + rotuloDoCampo(h);
  if (tag === 'LABEL') {
    const campo = h.querySelector<HTMLElement>('select, input, textarea');
    if (campo) return 'campo: ' + rotuloDoCampo(campo);
    const t = textoDoLabel(h as HTMLLabelElement);
    if (t) return t;
  }
  return (
    h.getAttribute('aria-label') ||
    h.getAttribute('title') ||
    (h.innerText || h.textContent || '').trim() ||
    h.tagName.toLowerCase()
  );
}

/** Área do clique: data-track-area explícito, ou detectada (modal, painel). */
function areaDo(el: Element): string | undefined {
  const explicita = (el.closest('[data-track-area]') as HTMLElement | null)?.dataset.trackArea;
  if (explicita) return explicita;
  if (el.closest('.pmodal-dialog, .tmodal-pedido-prio')) return 'dialogo';
  if (el.closest('.pmodal')) return 'modal_portal';
  if (el.closest('.tmodal')) return 'modal_tarefa';
  if (el.closest('.sheet')) return 'painel_filtros';
  if (el.closest('[role="dialog"]')) return 'modal';
  if (el.closest('header, nav')) return 'topo';
  return undefined;
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
      const area = areaDo(alvo);
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
