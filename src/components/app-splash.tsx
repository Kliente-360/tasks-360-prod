'use client';

/**
 * Loading overlay — copia direta do Alpine (index.html linha 80).
 *
 * Sem tentativa de espelhar o apple-touch-startup-image nativo. Só uma
 * telinha de "Carregando…" com o k360-mark pulsando. Some quando o
 * DataProvider termina de bootar.
 *
 * iOS PWA: o startup image nativo aparece primeiro e some quando o
 * WebKit dá 1º paint; aí esse overlay aparece. Pode ter handoff visível,
 * mas é discreto e idêntico ao desktop, sem rodeios.
 */

import { useData } from '@/lib/data-store';

export function AppSplash() {
  const { loading } = useData();
  if (!loading) return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[60] flex items-center justify-center bg-elev"
    >
      <div className="flex items-center gap-3 text-muted text-sm">
        <div
          className="k360-mark loading-pulse"
          style={{ width: 22, height: 22 }}
        >
          <span style={{ width: 7, height: 7 }} />
          <span style={{ width: 7, height: 7 }} />
          <span style={{ width: 7, height: 7 }} />
          <span style={{ width: 7, height: 7 }} />
        </div>
        <span className="font-mono">Carregando…</span>
      </div>
    </div>
  );
}
