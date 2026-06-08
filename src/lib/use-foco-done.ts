'use client';

/**
 * Hook · estado "resolvido hoje" do Foco (A.18 · 2026-06-05).
 *
 * Marca local-only (não persiste no DB). Chave composta `taskId:contexto`
 * porque a mesma task pode aparecer em vários contextos do Foco e o
 * usuário pode resolver em um sem afetar os outros.
 *
 * Persistência: localStorage com key versionada por data
 * (`kliente360-foco-done-YYYY-MM-DD`). No boot, purga keys de dias
 * anteriores. Listener `storage` mantém o counter no header sincronizado
 * entre abas/janelas.
 *
 * API
 *   const { resolved, toggle, isResolved, count } = useFocoDone();
 *
 *   toggle(taskId, contexto)            → flip do par
 *   isResolved(taskId, contexto)        → boolean
 *   count                               → quantidade total de pares
 *   resolved                            → Set<"taskId:contexto"> raw
 */

import { useCallback, useEffect, useState } from 'react';

const KEY_PREFIX = 'kliente360-foco-done-';

export type FocoContexto =
  | 'atrasadas'
  | 'hoje'
  | 'bloqueadas'
  | 'sem_comment'
  | 'sem_esforco'
  | 'sem_horas';

function todayKey(): string {
  return KEY_PREFIX + new Date().toISOString().slice(0, 10);
}

/** Compose `taskId:contexto`. */
function pairKey(taskId: string, contexto: FocoContexto): string {
  return `${taskId}:${contexto}`;
}

/** Lê o set salvo + purga keys obsoletas (dias anteriores). */
function readAndPurge(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const today = todayKey();
  try {
    // Purge: remove qualquer key foco-done de outras datas
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX) && k !== today) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));

    const raw = localStorage.getItem(today);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function write(set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(todayKey(), JSON.stringify([...set]));
  } catch {
    /* quota / SSR / private mode */
  }
}

/** Hook completo. */
export function useFocoDone(): {
  resolved: Set<string>;
  toggle: (taskId: string, contexto: FocoContexto) => void;
  isResolved: (taskId: string, contexto: FocoContexto) => boolean;
  count: number;
} {
  const [resolved, setResolved] = useState<Set<string>>(() => readAndPurge());

  // Listener pra atualizar quando outra aba/janela mexer no localStorage.
  // Também ouve evento custom emitido pelos próprios toggles desta aba
  // pra sincronizar Foco ↔ counter no header (mesma janela).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = () => setResolved(readAndPurge());
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith(KEY_PREFIX)) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('foco-done-changed', refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('foco-done-changed', refresh);
    };
  }, []);

  const toggle = useCallback((taskId: string, contexto: FocoContexto) => {
    setResolved((prev) => {
      const next = new Set(prev);
      const k = pairKey(taskId, contexto);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      write(next);
      // Notifica listeners na MESMA janela (storage event não dispara
      // pra writes da própria aba)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('foco-done-changed'));
      }
      return next;
    });
  }, []);

  const isResolved = useCallback(
    (taskId: string, contexto: FocoContexto) => resolved.has(pairKey(taskId, contexto)),
    [resolved],
  );

  return { resolved, toggle, isResolved, count: resolved.size };
}
