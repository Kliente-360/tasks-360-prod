'use client';

/**
 * Service Worker register + update prompt — Onda 0 · 4.I
 *
 * Registra `/sw.js` (gerado pelo @serwist/next) e detecta quando um
 * SW novo está esperando (= deploy novo). Mostra toast "Atualização
 * disponível · recarregar" que skipWaiting + reloada a aba.
 *
 * Em dev (process.env.NODE_ENV === 'development') o serwist desabilita
 * a geração do SW, então tentar registrar dá 404 — pulamos.
 */

import { useEffect, useRef } from 'react';
import { useToast } from '@/components/toast';

export function ServiceWorkerRegister() {
  const toast = useToast();
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    registered.current = true;

    let toastShown = false;

    const showUpdate = (waiting: ServiceWorker) => {
      if (toastShown) return;
      toastShown = true;
      // Toast "sticky" (duration 0) com botão pra recarregar — usuário
      // decide quando interromper o fluxo. Pra simplificar, ao clicar
      // em qualquer toast info, dispara o skipWaiting via postMessage.
      toast.info(
        'Atualização disponível — recarregue a aba pra aplicar.',
        0,
      );
      // Após 1 click no toast (qualquer um), comanda o SW novo a
      // assumir. Window reload pega o controle do novo SW.
      const reloadHandler = () => {
        waiting.postMessage({ type: 'SKIP_WAITING' });
      };
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
      // expose pra debug manual no DevTools
      (window as unknown as { __sw_reload?: () => void }).__sw_reload = reloadHandler;
    };

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        if (reg.waiting) showUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdate(sw);
            }
          });
        });
      })
      .catch(() => {
        /* sem SW (dev ou rede); ignora */
      });
  }, [toast]);

  return null;
}
