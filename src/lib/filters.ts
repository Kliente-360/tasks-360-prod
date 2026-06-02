/**
 * Predicado e helpers de filtros padronizados.
 *
 * Usado por Backlog, Kanban, Calendário, Dashboard, Timesheet — todas as
 * abas filtráveis aplicam o MESMO predicado (`matchFilters`), garantindo
 * consistência. UI mora em `<FilterBar>`.
 *
 * O componente do hi-fi usa nomes (strings). Aqui usamos IDs reais (uuids
 * do banco) — mais robusto e mais rápido (zero string compare por linha).
 * Busca full-text resolve IDs pra nomes via lookups passados como arg.
 */

import type { Cliente, Pessoa, Projeto, Task } from './types';
import { atrasada } from './task-utils';

export interface Filters {
  /** Busca livre — full-text em título + descrição + nomes resolvidos via lookups */
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

export const EMPTY_FILTERS: Filters = {
  q: '',
  cliente: '',
  projeto: '',
  resp: '',
  prazo: '',
};

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

/** Maps usados em búsca full-text — eficiente vs procurar em arrays. */
export interface FilterLookups {
  clientesById?: Map<string, Cliente>;
  projetosById?: Map<string, Projeto>;
  pessoasById?: Map<string, Pessoa>;
}

/**
 * Predicado central. `true` = task passa nos filtros.
 *
 * Busca (`f.q`) procura em:
 *  - título
 *  - descrição (se carregada)
 *  - nome do cliente (via lookup)
 *  - nome do projeto (via lookup)
 *  - nome da pessoa (via lookup)
 *  - tags (futuro, hoje vazio)
 *
 * Sem lookup, busca cai pra título+descrição apenas.
 */
export function matchFilters(t: Task, f: Filters, lookups?: FilterLookups): boolean {
  // Busca full-text — só constrói o haystack se houver query
  if (f.q) {
    const q = f.q.toLowerCase();
    const parts: string[] = [t.titulo];
    if (t.descricao) parts.push(t.descricao);
    if (lookups?.clientesById && t.clienteId) {
      const c = lookups.clientesById.get(t.clienteId);
      if (c) parts.push(c.nome);
    }
    if (lookups?.projetosById && t.projetoId) {
      const p = lookups.projetosById.get(t.projetoId);
      if (p) parts.push(p.nome);
    }
    if (lookups?.pessoasById && t.pessoaId) {
      const p = lookups.pessoasById.get(t.pessoaId);
      if (p) parts.push(p.nome);
    }
    if (t.tags?.length) parts.push(t.tags.join(' '));
    const hay = parts.join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }

  if (f.cliente && t.clienteId !== f.cliente) return false;
  if (f.projeto && t.projetoId !== f.projeto) return false;
  if (f.resp && t.pessoaId !== f.resp) return false;

  if (f.prazo) {
    const todayIso = new Date().toISOString().slice(0, 10);
    if (f.prazo === 'atrasadas' && !atrasada(t)) return false;
    if (f.prazo === 'hoje' && t.prazo !== todayIso) return false;
    if (f.prazo === 'sem' && t.prazo) return false;
    if (f.prazo === 'semana') {
      if (!t.prazo) return false;
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);
      const in7Iso = in7.toISOString().slice(0, 10);
      if (t.prazo < todayIso || t.prazo > in7Iso) return false;
    }
  }

  return true;
}

/** Opções padronizadas pro `<FilterSelect>` de Prazo. */
export const PRAZO_OPTIONS = [
  { v: 'atrasadas', label: 'Atrasadas' },
  { v: 'hoje', label: 'Hoje' },
  { v: 'semana', label: 'Esta semana' },
  { v: 'sem', label: 'Sem prazo' },
] as const;
