'use client';

/**
 * RealtimeIndicator · badge visual do estado do canal realtime.
 *
 * Sem esse badge, o usuário só descobre que o realtime caiu quando dá F5
 * e vê que tudo mudou. Com auto-reconnect + este indicador visual, o
 * status vira observável no header.
 *
 * 4 estados:
 *   - subscribed : dot verde discreto, sem tooltip (comportamento normal)
 *   - connecting : dot cinza pulsando, tooltip "conectando…"
 *   - error/closed : dot âmbar, tooltip "reconectando…"
 *   - idle : dot cinza estático (nunca subscribed nessa sessão)
 */

import { useData } from '@/lib/data-store';

export function RealtimeIndicator() {
  const { realtimeStatus } = useData();
  const map: Record<typeof realtimeStatus, { color: string; label: string; pulse: boolean }> = {
    subscribed: { color: 'var(--brand)', label: 'realtime · conectado', pulse: false },
    connecting: { color: 'var(--muted)', label: 'realtime · conectando…', pulse: true },
    error:      { color: 'var(--warn)', label: 'realtime · reconectando…', pulse: true },
    closed:     { color: 'var(--warn)', label: 'realtime · reconectando…', pulse: true },
    idle:       { color: 'var(--muted)', label: 'realtime · offline', pulse: false },
  };
  const s = map[realtimeStatus];
  return (
    <span
      className="inline-flex items-center gap-1"
      title={s.label}
      aria-label={s.label}
      role="status"
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{
          background: s.color,
          animation: s.pulse ? 'realtime-pulse 1.4s ease-in-out infinite' : undefined,
        }}
      />
    </span>
  );
}
