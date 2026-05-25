/// <reference lib="webworker" />

/**
 * Service Worker — Onda 0 · 4.I
 *
 * Gerado pelo @serwist/next em build (public/sw.js). Estratégia minimal
 * pra atender Lighthouse PWA + dar offline básico de shell:
 *
 * - precacheAndRoute() injeta automaticamente os assets do build
 *   (HTML/CSS/JS/fontes) com hash — cache-first com revalidação no
 *   próximo deploy via `__SW_MANIFEST` que o Serwist popula.
 * - defaultCache (runtime) cuida do que NÃO foi pré-cached: páginas
 *   navegáveis (network-first), JSON da Supabase (network-first com
 *   fallback de cache curto), imagens (stale-while-revalidate).
 * - skipWaiting + clientsClaim fazem o SW novo assumir imediatamente
 *   (combina com o update prompt do client que recarrega a aba).
 */

import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

// Tipos extras pro escopo do SW
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
