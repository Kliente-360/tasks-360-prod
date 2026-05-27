'use client';

import { useEffect } from 'react';
import { useData } from '@/lib/data-store';
import { atrasada } from '@/lib/task-utils';

/**
 * Sincroniza o badge do ícone PWA com o total de tasks atrasadas no backlog.
 * Usa a Web App Badging API (Android Chrome 81+ / iOS Safari 16.4+).
 * Não renderiza nada — efeito colateral puro.
 */
export function BadgeSync() {
  const { tasks, loading } = useData();

  useEffect(() => {
    if (loading) return;
    if (!('setAppBadge' in navigator)) return;

    const count = tasks.filter((t) => !t.arquivadoEm && atrasada(t)).length;

    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [tasks, loading]);

  return null;
}
