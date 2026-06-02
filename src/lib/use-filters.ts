'use client';

import { useCallback, useState } from 'react';
import { EMPTY_FILTERS, type Filters } from './filters';

/**
 * Hook de filtros padronizado. Usado por toda tela que mostra `<FilterBar>`.
 * Retorna `{ f, set, clear }` — interface compacta pensada pra passar
 * direto pro componente.
 *
 *   const { f, set, clear } = useFilters();
 *   <FilterBar f={f} set={set} onClear={clear} />
 *   const filtradas = tasks.filter((t) => matchFilters(t, f, lookups));
 *
 * Pra A.5 (Saved views) futura: vai persistir em URL/localStorage por
 * `scope`. Por enquanto fica em memória — estado morre ao trocar de aba.
 */
export function useFilters(initial: Partial<Filters> = {}) {
  const [f, setF] = useState<Filters>({ ...EMPTY_FILTERS, ...initial });

  const set = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setF((cur) => ({ ...cur, [key]: value }));
  }, []);

  const clear = useCallback(() => setF(EMPTY_FILTERS), []);

  return { f, set, clear };
}
