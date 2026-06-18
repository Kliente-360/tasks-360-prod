'use client';

/**
 * Calendário — Onda 0 · Bloco 2.7
 *
 * Grid mensal segunda-domingo das tasks com prazo. Filtros (cliente/
 * projeto encadeado/pessoa) usam o sentinel '__empty__' do Backlog.
 * Click numa célula com tasks abre painel abaixo com os cards e select
 * "mover pra etapa" inline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useData,
  useClientesById,
  useProjetosById,
  usePessoasById,
  useProjetosByCliente,
} from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
import { useToast } from '@/components/toast';
import { PageHeader } from '@/components/page-header';
import { FilterBar, type MoreMenuItem } from '@/components/filter-bar';
import { Icon } from '@/components/icons';
import { PriChip, TaskAvatar, PrazoLabel, TagIA } from '@/components/task-card/primitives';
import { createClient } from '@/lib/supabase/client';
import type { Filters as StdFilters } from '@/lib/filters';
import {
  agingDays,
  agingLevel,
  atrasada,
  fmtDate,
  fmtDateShort,
  isPreTriagem,
  needsTriage,
  triageFailures,
} from '@/lib/task-utils';
import { SUB_TO_MACRO } from '@/lib/task-constants';
import { CLEAR_FILTERS_EVENT } from '@/lib/events';
import { getSharedFilters, patchSharedFilters, clearSharedFilters } from '@/lib/shared-filters';
import type { Task } from '@/lib/types';

const EMPTY = '__empty__';
const PRIO_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

type Cell = {
  iso: string;
  day: number;
  isCurMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  tasks: Task[];
};

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

export function CalendarioClient() {
  const { tasks, clientes, projetos, pessoas, patchTask, replaceTask, loading, error } = useData();
  const { openEdit } = useTaskModal();
  const toast = useToast();
  const clientesById = useClientesById();
  const projetosById = useProjetosById();
  const pessoasById = usePessoasById();
  const projetosByCliente = useProjetosByCliente();

  const clientesAtivos = useMemo(() => clientes.filter((c) => !c.arquivadoEm), [clientes]);
  const pessoasNaoCliente = useMemo(() => pessoas.filter((p) => p.role !== 'cliente' && p.invited_at !== null), [pessoas]);

  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const sb = sbRef.current;

  // Cursor = primeiro dia do mês visível
  const [cursor, setCursor] = useState<number>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  });
  const [selectedIso, setSelectedIso] = useState<string>('');

  const [filters, setFilters] = useState<{
    cliente: string;
    projeto: string;
    pessoa: string;
    status: string;
    prazo: '' | 'atrasadas' | 'hoje' | 'semana' | 'sem';
  }>(() => {
    const s = getSharedFilters();
    return {
      cliente: s.cliente,
      projeto: s.projeto,
      pessoa: s.pessoa,
      status: 'todas',
      prazo: s.prazo,
    };
  });
  useEffect(() => {
    patchSharedFilters({
      cliente: filters.cliente,
      projeto: filters.projeto,
      pessoa: filters.pessoa,
      prazo: filters.prazo,
    });
  }, [filters.cliente, filters.projeto, filters.pessoa, filters.prazo]);
  const [qDraft, setQDraft] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [onlyIA, setOnlyIA] = useState(false);
  const [onlyHumano, setOnlyHumano] = useState(false);

  // g+l global → limpa filtros (status volta pro default 'abertas').
  useEffect(() => {
    const handler = () => {
      setFilters({ cliente: '', projeto: '', pessoa: '', status: 'todas', prazo: '' });
      setSelectedIso('');
      setQDraft('');
      setOnlyIA(false);
      setOnlyHumano(false);
      clearSharedFilters();
    };
    window.addEventListener(CLEAR_FILTERS_EVENT, handler);
    return () => window.removeEventListener(CLEAR_FILTERS_EVENT, handler);
  }, []);

  const projetosFiltrados = useMemo(() => {
    if (!filters.cliente || filters.cliente === EMPTY) {
      return projetos.filter((p) => !p.arquivadoEm);
    }
    return (projetosByCliente.get(filters.cliente) ?? []).filter((p) => !p.arquivadoEm);
  }, [filters.cliente, projetos, projetosByCliente]);

  // Navegação
  const goPrev = useCallback(() => {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() - 1);
    setCursor(d.getTime());
    setSelectedIso('');
  }, [cursor]);
  const goNext = useCallback(() => {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() + 1);
    setCursor(d.getTime());
    setSelectedIso('');
  }, [cursor]);
  const goToday = useCallback(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    setCursor(d.getTime());
    setSelectedIso('');
  }, []);

  // Label do mês — "Maio de 2026". Capitaliza só a primeira letra (não usar
  // `text-transform: capitalize` no CSS pq isso vira "Maio De 2026" — cada
  // palavra inicia maiúscula).
  const monthLabel = useMemo(() => {
    const d = new Date(cursor);
    const raw = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [cursor]);

  // Detecta mobile pra trocar grid 7-col desktop vs 5-col (sem fim de semana).
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // ============ Cells ============
  const cells = useMemo<Cell[]>(() => {
    const cur = new Date(cursor);
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const first = new Date(y, m, 1);
    // Semana começa no domingo (dow=0). Ajusta offset pra alinhar.
    const offset = first.getDay(); // 0=dom, 1=seg, ..., 6=sab
    const start = new Date(y, m, 1 - offset);
    const today = isoLocal(new Date());

    const hasFilter = !!(filters.cliente || filters.projeto || filters.pessoa || filters.prazo || qDraft || onlyIA || onlyHumano);
    const q = qDraft.trim().toLowerCase();
    const todayIso = today;
    const in7d = new Date(); in7d.setDate(in7d.getDate() + 7);
    const in7dIso = in7d.toISOString().slice(0, 10);
    const matchFilters = (t: Task) => {
      if (!showArchived && t.arquivadoEm) return false;
      if (filters.cliente === EMPTY) {
        if (t.clienteId) return false;
      } else if (filters.cliente && t.clienteId !== filters.cliente) return false;
      if (filters.projeto === EMPTY) {
        if (t.projetoId) return false;
      } else if (filters.projeto && t.projetoId !== filters.projeto) return false;
      if (filters.pessoa === EMPTY) {
        if (t.pessoaId) return false;
      } else if (filters.pessoa && t.pessoaId !== filters.pessoa) return false;
      if (onlyIA && !t.criadoPorIa) return false;
      if (onlyHumano && t.criadoPorIa) return false;
      if (filters.prazo === 'atrasadas' && !atrasada(t)) return false;
      if (filters.prazo === 'hoje' && t.prazo !== todayIso) return false;
      if (filters.prazo === 'sem' && t.prazo) return false;
      if (filters.prazo === 'semana') {
        if (!t.prazo) return false;
        if (t.prazo < todayIso || t.prazo > in7dIso) return false;
      }
      if (q) {
        const cli = clientesById.get(t.clienteId)?.nome ?? '';
        const proj = projetosById.get(t.projetoId)?.nome ?? '';
        const pess = pessoasById.get(t.pessoaId)?.nome ?? '';
        const hay = [
          t.titulo, cli, proj, pess, t.descricao ?? '',
          t.prioridade, t.status, t.subetapa,
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };
    const matchStatus = (t: Task) => {
      switch (filters.status) {
        case 'abertas':   return t.status !== 'concluido';
        case 'todas':     return true;
        case 'backlog':   return t.status === 'backlog';
        case 'andamento': return t.status === 'andamento';
        case 'bloqueado': return t.status === 'bloqueado';
        case 'concluido': return t.status === 'concluido';
        default:          return true;
      }
    };

    const byPrazo: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (!t.prazo) continue;
      if (t.arquivadoEm) continue;
      // Gate A.4: IA pre-triagem fica fora do calendário
      if (isPreTriagem(t)) continue;
      if (!matchStatus(t)) continue;
      if (hasFilter && !matchFilters(t)) continue;
      (byPrazo[t.prazo] = byPrazo[t.prazo] || []).push(t);
    }
    for (const k of Object.keys(byPrazo)) {
      byPrazo[k].sort((a, b) => (PRIO_RANK[a.prioridade] ?? 9) - (PRIO_RANK[b.prioridade] ?? 9));
    }
    const out: Cell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = isoLocal(d);
      const dow = d.getDay(); // 0=dom, 6=sab
      out.push({
        iso,
        day: d.getDate(),
        isCurMonth: d.getMonth() === m,
        isToday: iso === today,
        isWeekend: dow === 0 || dow === 6,
        tasks: byPrazo[iso] ?? [],
      });
    }
    return out;
  }, [cursor, tasks, filters, qDraft, showArchived, onlyIA, onlyHumano, clientesById, projetosById, pessoasById]);

  // Versão mobile: tira fim de semana pra caber 5 colunas no viewport
  // estreito; matem a ordem segunda → sexta.
  const cellsMobile = useMemo(() => cells.filter((c) => !c.isWeekend), [cells]);
  const cellsActive = isMobile ? cellsMobile : cells;

  const selectedTasks = useMemo(() => {
    if (!selectedIso) return [];
    return cells.find((c) => c.iso === selectedIso)?.tasks ?? [];
  }, [cells, selectedIso]);

  // Stats do mês corrente
  const stats = useMemo(() => {
    let total = 0;
    let late = 0;
    for (const c of cells) {
      if (!c.isCurMonth) continue;
      for (const t of c.tasks) {
        total++;
        if (atrasada(t)) late++;
      }
    }
    return { total, late };
  }, [cells]);

  // Move task entre etapas (Calendário tem select inline)
  const setTaskSubetapa = useCallback(
    async (t: Task, newSub: string) => {
      if (!t || t.subetapa === newSub) return;
      const newMacro = SUB_TO_MACRO[newSub] ?? t.status;
      const macroChanged = t.status !== newMacro;
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const prev = patchTask(t.id, {
        subetapa: newSub,
        status: newMacro as Task['status'],
        subetapaEm: nowMs,
        statusEm: macroChanged ? nowMs : t.statusEm,
      });
      if (!prev) return;
      const payload: Record<string, unknown> = { subetapa: newSub, subetapa_em: nowIso };
      if (macroChanged) payload.status_em = nowIso;
      const { error } = await sb.from('tasks').update(payload).eq('id', t.id);
      if (error) {
        replaceTask(t.id, prev);
        toast.error('Erro ao mover: ' + error.message);
        return;
      }
      if (macroChanged) {
        sb.from('task_field_history').insert({
          task_id: t.id,
          field: 'status',
          from_value: prev.status,
          to_value: newMacro,
          actor_pessoa_id: null,
          actor_source: 'app',
          occurred_at: nowIso,
        });
      }
    },
    [patchTask, replaceTask, sb, toast],
  );

  const tempoNaSubetapa = (t: Task): string => {
    const ts = t.subetapaEm || t.statusEm;
    if (!ts) return '';
    const d = Math.floor((Date.now() - ts) / 86400000);
    if (d <= 0) return 'hoje';
    if (d === 1) return 'há 1d';
    return 'há ' + d + 'd';
  };

  if (loading) return <div className="text-muted text-sm">Carregando…</div>;
  if (error) return <div className="text-[color:var(--danger)] text-sm">Erro: {error}</div>;

  return (
    <div>
      {/* Desktop · PageHeader + setas no titleAside + FilterBar (sem Status, vira cor no bloquinho) */}
      <div className="hidden md:block">
        <PageHeader
          title={monthLabel}
          right={
            <FilterBar
              leftSlot={
                <div className="view-toggle view-toggle-icons" role="group" aria-label="Navegação de mês">
                  <button
                    type="button"
                    onClick={goPrev}
                    title="Mês anterior"
                    aria-label="Mês anterior"
                  >
                    <Icon name="chevron-left" size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    title="Próximo mês"
                    aria-label="Próximo mês"
                  >
                    <Icon name="chevron-right" size={15} />
                  </button>
                </div>
              }
              f={{
                q: qDraft,
                cliente: filters.cliente,
                projeto: filters.projeto,
                resp: filters.pessoa,
                prazo: filters.prazo,
              } satisfies StdFilters}
              set={(key, value) => {
                if (key === 'q') setQDraft(value);
                else if (key === 'cliente') setFilters({ ...filters, cliente: value, projeto: value ? filters.projeto : '' });
                else if (key === 'projeto') setFilters({ ...filters, projeto: value });
                else if (key === 'resp') setFilters({ ...filters, pessoa: value });
                else if (key === 'prazo') setFilters({ ...filters, prazo: value as typeof filters.prazo });
              }}
              onClear={() => {
                setQDraft('');
                setFilters({ cliente: '', projeto: '', pessoa: '', status: 'todas', prazo: '' });
                setShowArchived(false);
                setOnlyIA(false);
                setOnlyHumano(false);
                clearSharedFilters();
              }}
              clienteOptions={clientesAtivos.map((c) => ({ v: c.id, label: c.nome }))}
              projetoOptions={projetosFiltrados.map((p) => ({ v: p.id, label: p.nome }))}
              pessoaOptions={pessoasNaoCliente.map((p) => ({ v: p.id, label: p.nome }))}
              moreItems={[
                { key: 'group-resp', label: 'Agrupar: Responsável', enabled: false, kind: 'action', icon: 'users' },
                { key: 'group-cli', label: 'Agrupar: Cliente', enabled: false, kind: 'action', icon: 'building' },
                { key: 'group-status', label: 'Agrupar: Status', enabled: false, kind: 'action', icon: 'list-filter' },
                { key: 'div1', label: '---' },
                { key: 'arquivadas', label: 'Mostrar arquivadas', kind: 'toggle', active: showArchived, onClick: () => setShowArchived((v) => !v) },
                { key: 'ia', label: 'Somente criadas por IA', kind: 'toggle', active: onlyIA, onClick: () => { setOnlyIA((v) => !v); setOnlyHumano(false); } },
                { key: 'humano', label: 'Somente criadas por humanos', kind: 'toggle', active: onlyHumano, onClick: () => { setOnlyHumano((v) => !v); setOnlyIA(false); } },
              ] satisfies MoreMenuItem[]}
            />
          }
        />
      </div>

      {/* Mobile filters */}
      <div className="flex flex-col gap-2 mb-5 md:hidden">
        <select
          className={`inp ${filters.cliente ? 'is-active' : ''}`}
          value={filters.cliente}
          onChange={(e) => {
            const v = e.target.value;
            setFilters({ ...filters, cliente: v, projeto: v && v !== EMPTY ? filters.projeto : '' });
          }}
        >
          <option value="">Cliente</option>
          <option value={EMPTY}>— sem cliente</option>
          {clientesAtivos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <select
          className={`inp ${filters.projeto ? 'is-active' : ''}`}
          value={filters.projeto}
          disabled={!filters.cliente || filters.cliente === EMPTY}
          onChange={(e) => setFilters({ ...filters, projeto: e.target.value })}
        >
          <option value="">Projeto</option>
          <option value={EMPTY}>— sem projeto</option>
          {projetosFiltrados.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <select
          className={`inp ${filters.pessoa ? 'is-active' : ''}`}
          value={filters.pessoa}
          onChange={(e) => setFilters({ ...filters, pessoa: e.target.value })}
        >
          <option value="">Responsável</option>
          <option value={EMPTY}>— sem responsável</option>
          {pessoasNaoCliente.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <select
          className={`inp ${filters.status !== 'todas' ? 'is-active' : ''}`}
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="abertas">Abertas</option>
          <option value="todas">Todas</option>
          <option value="backlog">Backlog</option>
          <option value="andamento">Em andamento</option>
          <option value="bloqueado">Bloqueado</option>
          <option value="concluido">Concluído</option>
        </select>
      </div>

      {/* Card containing grid + selected panel */}
      <div className="card p-3 md:p-5">
        {/* Mobile nav (mês prev / today / next + label) */}
        <div className="flex items-center justify-between gap-2 mb-3 md:hidden">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className="btn btn-ghost btn-icon text-xs"
              onClick={goPrev}
              title="Mês anterior"
            >
              ‹
            </button>
            <button type="button" className="btn btn-ghost text-xs" onClick={goToday}>
              hoje
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon text-xs"
              onClick={goNext}
              title="Próximo mês"
            >
              ›
            </button>
          </div>
          <div className="font-brand text-base font-semibold text-right truncate">
            {monthLabel}
          </div>
        </div>

        {/* Headers — desktop dom-seg-ter-qua-qui-sex-sáb, mobile seg-sex */}
        <div className={`cal-grid mb-1 ${isMobile ? 'cal-grid-mobile' : ''}`}>
          {(isMobile
            ? ['seg', 'ter', 'qua', 'qui', 'sex']
            : ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
          ).map((d) => (
            <div key={d} className="cal-head text-center">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className={`cal-grid ${isMobile ? 'cal-grid-mobile' : ''}`}>
          {cellsActive.map((cell) => {
            const klass = [
              'cal-cell',
              !cell.isCurMonth && 'muted',
              cell.isToday && 'today',
              cell.isWeekend && 'weekend',
              cell.tasks.length > 0 && 'has-tasks',
              selectedIso === cell.iso && 'selected',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={cell.iso}
                className={klass}
                onClick={() => {
                  if (cell.tasks.length > 0) {
                    setSelectedIso((cur) => (cur === cell.iso ? '' : cell.iso));
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="cal-num">{cell.day}</span>
                  {cell.tasks.length > 0 && (
                    <span className="text-[9px] font-mono text-muted">{cell.tasks.length}</span>
                  )}
                </div>
                {/* Mobile: dots */}
                <div className="md:hidden mt-1">
                  {cell.tasks.slice(0, 8).map((t) => (
                    <span
                      key={t.id}
                      className={`cal-dot status-${t.status === 'concluido' ? 'done' : atrasada(t) ? 'late' : t.status === 'bloqueado' ? 'blocked' : t.status === 'andamento' ? 'active' : 'backlog'}`}
                      title={t.titulo}
                    />
                  ))}
                </div>
                {/* Desktop: chips */}
                <div className="hidden md:block">
                  {cell.tasks.slice(0, 4).map((t) => (
                    <span
                      key={t.id}
                      className={`cal-task status-${t.status === 'concluido' ? 'done' : atrasada(t) ? 'late' : t.status === 'bloqueado' ? 'blocked' : t.status === 'andamento' ? 'active' : 'backlog'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(t.id);
                      }}
                      title={
                        t.titulo +
                        ' · ' +
                        (clientesById.get(t.clienteId)?.nome ?? '—') +
                        (t.pessoaId ? ' · ' + (pessoasById.get(t.pessoaId)?.nome ?? '—') : '')
                      }
                    >
                      {t.titulo}
                    </span>
                  ))}
                  {cell.tasks.length > 4 && (
                    <div className="text-[9px] text-muted font-mono mt-0.5">
                      +{cell.tasks.length - 4} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Painel de tasks do dia selecionado */}
        {selectedIso && selectedTasks.length > 0 && (
          <div className="mt-4 pt-4 border-t border-line">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted font-mono font-semibold">
                  prazo
                </div>
                <div className="font-brand text-base md:text-lg font-semibold">
                  {fmtDate(selectedIso)}
                </div>
              </div>
              <span className="text-xs text-muted font-mono">
                {selectedTasks.length} tarefa{selectedTasks.length === 1 ? '' : 's'} · ordem por prioridade
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {selectedTasks.map((t) => {
                const lvl = agingLevel(t);
                return (
                  <div key={t.id} className="kcard" onClick={() => openEdit(t.id)}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="font-medium text-sm leading-snug flex items-center gap-1.5">
                        {t.criadoPorIa && <TagIA />}
                        <span>{t.titulo}</span>
                      </div>
                      <PriChip prio={t.prioridade} />
                    </div>
                    <div className="text-xs text-muted mb-2">
                      {(clientesById.get(t.clienteId)?.nome ?? '—') +
                        ' · ' +
                        (projetosById.get(t.projetoId)?.nome ?? '—')}
                    </div>
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <TaskAvatar name={pessoasById.get(t.pessoaId)?.nome ?? ''} />
                        <span className="text-ink-soft truncate">
                          {(pessoasById.get(t.pessoaId)?.nome ?? '—').split(/\s+/)[0]}
                        </span>
                      </span>
                      <PrazoLabel task={t} />
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <div className="text-[10px] text-muted font-mono">
                        {tempoNaSubetapa(t)} nesta etapa
                      </div>
                      {lvl !== 'fresh' && (
                        <span
                          className={`aging-badge aging-${lvl}`}
                          title={`parada há ${agingDays(t)} dias na macro`}
                        >
                          {agingDays(t)}d
                        </span>
                      )}
                      {needsTriage(t) && (
                        <span className="triage-badge" title={triageFailures(t).join(' · ')}>
                          triar
                        </span>
                      )}
                    </div>
                    <div className="mt-3 pt-3 border-t border-line" onClick={(e) => e.stopPropagation()}>
                      <select
                        className="inp text-xs py-1.5"
                        value={t.subetapa}
                        onChange={(e) => setTaskSubetapa(t, e.target.value)}
                        title="Mover para…"
                      >
                        <optgroup label="Backlog">
                          <option value="backlog">→ Backlog</option>
                          <option value="priorizado">→ Priorizado</option>
                          <option value="em_definicao">→ Em definição</option>
                          <option value="escopo_definido">→ Escopo definido</option>
                        </optgroup>
                        <optgroup label="Em andamento">
                          <option value="em_desenvolvimento">→ Em desenvolvimento</option>
                          <option value="em_homologacao">→ Em homologação</option>
                          <option value="em_revisao">→ Em revisão</option>
                          <option value="pronto_producao">→ Pronto p/ produção</option>
                          <option value="em_implantacao">→ Em implantação</option>
                        </optgroup>
                        <optgroup label="Bloqueado">
                          <option value="bloqueado">→ Bloqueado</option>
                        </optgroup>
                        <optgroup label="Concluído">
                          <option value="concluido">→ Concluído</option>
                        </optgroup>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legenda · cores dos bloquinhos (status) */}
        <div className="text-[10px] text-muted font-mono mt-3 flex items-center gap-3 flex-wrap">
          <span>
            <strong className="text-ink-soft">{stats.total}</strong> no mês
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="cal-dot status-backlog" /> backlog
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="cal-dot status-active" /> andamento
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="cal-dot status-blocked" /> bloqueado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="cal-dot status-late" /> atrasada
            {stats.late > 0 ? ` (${stats.late})` : ''}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="cal-dot status-done" /> concluído
          </span>
        </div>
      </div>
    </div>
  );
}
