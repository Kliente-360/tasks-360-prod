'use client';

import { useEffect, useState } from 'react';

/**
 * Store global de filtros canônicos compartilhados entre as abas que usam
 * `<FilterBar>` (Backlog, Kanban, Calendário, Timesheet, Dashboard).
 *
 * Persistência em `sessionStorage` — sobrevive entre navegações e reloads,
 * mas zera ao fechar o navegador (evita o usuário voltar amanhã e ver
 * filtro antigo aplicado sem entender por quê).
 *
 * Decisão de escopo:
 *  - Persistir: cliente, projeto, pessoa, prazo, tag.
 *  - **Não** persistir: `q` (busca livre). Carregar busca entre telas é
 *    confuso — busca é intencionalmente one-off por tela.
 *  - **Não** persistir: filtros muito específicos de tela (onlyIA,
 *    showArchived, pri, complexidade, status, origem, etc).
 */

export interface SharedFilters {
  cliente: string;
  projeto: string;
  pessoa: string;
  prazo: '' | 'atrasadas' | 'hoje' | 'semana' | 'sem';
  tag: string;
}

export const EMPTY_SHARED_FILTERS: SharedFilters = {
  cliente: '',
  projeto: '',
  pessoa: '',
  prazo: '',
  tag: '',
};

const STORAGE_KEY = 'tasks360.filters.shared.v1';

let state: SharedFilters = EMPTY_SHARED_FILTERS;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...EMPTY_SHARED_FILTERS, ...JSON.parse(raw) };
  } catch {
    /* sessionStorage indisponível — segue em memória */
  }
}

function persist() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota cheia ou storage bloqueado — segue em memória */
  }
}

function notify() {
  persist();
  listeners.forEach((l) => l());
}

export function getSharedFilters(): SharedFilters {
  hydrate();
  return state;
}

export function setSharedFilter<K extends keyof SharedFilters>(
  key: K,
  value: SharedFilters[K],
) {
  hydrate();
  if (state[key] === value) return;
  state = { ...state, [key]: value };
  notify();
}

export function patchSharedFilters(patch: Partial<SharedFilters>) {
  hydrate();
  let changed = false;
  const next = { ...state };
  for (const k of Object.keys(patch) as (keyof SharedFilters)[]) {
    const v = patch[k];
    if (v !== undefined && next[k] !== v) {
      (next as Record<string, unknown>)[k] = v;
      changed = true;
    }
  }
  if (!changed) return;
  state = next;
  notify();
}

export function clearSharedFilters() {
  hydrate();
  state = EMPTY_SHARED_FILTERS;
  notify();
}

/**
 * Hook React. Re-renderiza ao mudar qualquer filtro compartilhado.
 * Use `setSharedFilter(key, value)` / `clearSharedFilters()` pra mutar —
 * mudança propaga pra todas as abas montadas.
 */
export function useSharedFilters(): SharedFilters {
  hydrate();
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return state;
}
