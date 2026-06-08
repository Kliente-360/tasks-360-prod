/**
 * Tipo e helpers de filtros padronizados.
 *
 * Usado por Backlog, Kanban, Calendário, Dashboard, Timesheet — todas as
 * abas filtráveis usam a mesma shape de `Filters`. UI mora em `<FilterBar>`.
 *
 * Predicado/aplicação varia por tela (cada client tem sua versão custom
 * pra suportar grupos, lookups específicos etc), então não centralizamos
 * `matchFilters` aqui — viva no caller que precisar.
 */

export interface Filters {
  /** Busca livre — full-text em título + descrição + nomes resolvidos */
  q: string;
  /** UUID do cliente */
  cliente: string;
  /** UUID do projeto */
  projeto: string;
  /** UUID da pessoa responsável */
  resp: string;
  /** 'atrasadas' | 'hoje' | 'semana' | 'sem' | '' */
  prazo: '' | 'atrasadas' | 'hoje' | 'semana' | 'sem';
}

/** Quais filtros estão ativos. Usado pelo botão "Limpar (N)". */
export function countActive(f: Filters): number {
  let n = 0;
  if (f.q) n++;
  if (f.cliente) n++;
  if (f.projeto) n++;
  if (f.resp) n++;
  if (f.prazo) n++;
  return n;
}

/** Opções padronizadas pro `<FilterSelect>` de Prazo. */
export const PRAZO_OPTIONS = [
  { v: 'atrasadas', label: 'Atrasadas' },
  { v: 'hoje', label: 'Hoje' },
  { v: 'semana', label: 'Esta semana' },
  { v: 'sem', label: 'Sem prazo' },
] as const;
