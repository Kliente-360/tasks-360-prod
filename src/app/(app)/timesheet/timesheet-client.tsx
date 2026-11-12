'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useData, useTasksById, useClientesById, useProjetosById, usePessoasById } from '@/lib/data-store';
import { fmtDuration, useTimer } from '@/lib/use-timer';
import { useTaskModal } from '@/components/task-modal';
import { ManualEntryPopover } from '@/components/timer-button';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { FilterBar, type MoreMenuItem } from '@/components/filter-bar';
import { atrasada } from '@/lib/task-utils';
import type { Filters as StdFilters } from '@/lib/filters';
import { getSharedFilters, patchSharedFilters, clearSharedFilters } from '@/lib/shared-filters';
import { timeEntryFromDb } from '@/lib/adapters';
import { cn } from '@/lib/utils';
import type { Task, TimeEntry } from '@/lib/types';

type TsKey = 'pessoa' | 'cliente' | 'projeto' | 'tarefa' | 'data' | 'duracao' | 'inicio' | 'fim';
type SortKey = { key: TsKey; dir: 'asc' | 'desc' };

const DIA_MS = 86_400_000;
const duracaoMs = (e: TimeEntry) => (e.endedAt ?? Date.now()) - e.startedAt;
/** Horas em decimal pt-BR: 12,5h */
const fmtHoras = (ms: number) => `${(ms / 3_600_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`;

function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(ms: number) {
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function TimesheetClient() {
  const { currentPessoa, viewerRole, clientes, projetos, loading, timeEntriesAnalise: timeEntries, tasksAnalise, removeTimeEntry, upsertTimeEntry } = useData();
  const { activeEntry, startTimer } = useTimer();
  const tasksById = useTasksById();
  const clientesById = useClientesById();
  const projetosById = useProjetosById();
  const pessoasById = usePessoasById();
  const { openEdit } = useTaskModal();
  // Inclui as tarefas privadas anônimas (só prioridade), para o KPI de P0/P1
  const tasksAnaliseById = useMemo(() => new Map<string, Task>(tasksAnalise.map((t) => [t.id, t])), [tasksAnalise]);

  const isAdmin = viewerRole === 'admin';
  const [qDraft, setQDraft] = useState('');
  const [filterCliente, setFilterCliente] = useState(() => getSharedFilters().cliente);
  const [filterProjeto, setFilterProjeto] = useState(() => getSharedFilters().projeto);
  const [filterPessoaId, setFilterPessoaId] = useState(() => getSharedFilters().pessoa);
  const [filterPrazo, setFilterPrazo] = useState<'' | 'atrasadas' | 'hoje' | 'semana' | 'sem'>(() => getSharedFilters().prazo);
  useEffect(() => {
    patchSharedFilters({
      cliente: filterCliente,
      projeto: filterProjeto,
      pessoa: filterPessoaId,
      prazo: filterPrazo,
    });
  }, [filterCliente, filterProjeto, filterPessoaId, filterPrazo]);
  const [groupBy, setGroupBy] = useState<'' | 'resp' | 'cli' | 'status'>('');

  const clientesAtivos = useMemo(() => clientes.filter((c) => !c.arquivadoEm), [clientes]);
  const projetosFiltrados = useMemo(
    () => projetos.filter((p) => !p.arquivadoEm && (!filterCliente || p.clienteId === filterCliente)),
    [projetos, filterCliente],
  );

  // Filtra entries cruzando com a task vinculada (que tem cliente/projeto/prazo).
  const entries = useMemo(() => {
    if (!currentPessoa) return [];
    const q = qDraft.trim().toLowerCase();
    const todayIso = new Date().toISOString().slice(0, 10);
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const in7Iso = in7.toISOString().slice(0, 10);
    return timeEntries.filter((e) => {
      // Não-admin sempre vê só os próprios
      if (!isAdmin && e.pessoaId !== currentPessoa.id) return false;
      // Filtro de pessoa (admin)
      if (filterPessoaId && e.pessoaId !== filterPessoaId) return false;
      // Filtros vinculados à task (cliente/projeto/prazo/busca)
      const t = tasksById.get(e.taskId);
      if (filterCliente && t?.clienteId !== filterCliente) return false;
      if (filterProjeto && t?.projetoId !== filterProjeto) return false;
      if (filterPrazo && t) {
        if (filterPrazo === 'atrasadas' && !atrasada(t)) return false;
        if (filterPrazo === 'hoje' && t.prazo !== todayIso) return false;
        if (filterPrazo === 'sem' && t.prazo) return false;
        if (filterPrazo === 'semana') {
          if (!t.prazo || t.prazo < todayIso || t.prazo > in7Iso) return false;
        }
      }
      if (q) {
        const taskTitle = t?.titulo ?? '';
        const cliNome = t ? (clientesById.get(t.clienteId)?.nome ?? '') : '';
        const projNome = t ? (projetosById.get(t.projetoId)?.nome ?? '') : '';
        const pessNome = pessoasById.get(e.pessoaId)?.nome ?? '';
        const hay = [taskTitle, cliNome, projNome, pessNome, e.note ?? ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [timeEntries, currentPessoa, isAdmin, filterPessoaId, filterCliente, filterProjeto, filterPrazo, qDraft, tasksById, clientesById, projetosById, pessoasById]);

  // ============ Ordenação encadeada (igual ao Backlog) ============
  // Clique numa coluna nova: vira a 1ª chave (asc), as outras descem (máx. 3).
  // Clique na 1ª: asc → desc → sai. Sem chave: mais recente primeiro.
  const [sortKeys, setSortKeys] = useState<SortKey[]>([]);
  const sortBy = useCallback((key: TsKey) => {
    setSortKeys((cur) => {
      const idx = cur.findIndex((s) => s.key === key);
      const rest = cur.filter((s) => s.key !== key).slice(0, 2);
      if (idx !== 0) return [{ key, dir: 'asc' }, ...rest];
      if (cur[0].dir === 'asc') return [{ key, dir: 'desc' }, ...cur.slice(1)];
      return cur.slice(1);
    });
  }, []);
  const sortIcon = useCallback((key: TsKey): string => {
    const idx = sortKeys.findIndex((s) => s.key === key);
    if (idx === -1) return '';
    const arrow = sortKeys[idx].dir === 'asc' ? '▲' : '▼';
    return sortKeys.length > 1 ? `${arrow}${idx + 1}` : arrow;
  }, [sortKeys]);

  const sorted = useMemo(() => {
    const arr = [...entries];
    if (sortKeys.length === 0) return arr.sort((a, b) => b.startedAt - a.startedAt);
    const minutosDoDia = (ms: number) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
    const val = (e: TimeEntry, k: TsKey): string | number | null => {
      const t = tasksById.get(e.taskId);
      switch (k) {
        case 'pessoa': return pessoasById.get(e.pessoaId)?.nome ?? '';
        case 'cliente': return t ? (clientesById.get(t.clienteId)?.nome ?? '') : '';
        case 'projeto': return t ? (projetosById.get(t.projetoId)?.nome ?? '') : '';
        case 'tarefa': return e.mascarada ? '' : (t?.titulo ?? '');
        case 'data': return e.startedAt;
        case 'duracao': return duracaoMs(e);
        case 'inicio': return e.manual ? null : minutosDoDia(e.startedAt);
        case 'fim': return e.manual || !e.endedAt ? null : minutosDoDia(e.endedAt);
      }
    };
    return arr.sort((a, b) => {
      for (const { key, dir } of sortKeys) {
        const av = val(a, key);
        const bv = val(b, key);
        if (av === bv) continue;
        // Sem valor (lançamento manual em Início/Fim) vai sempre para o fim
        if (av === null) return 1;
        if (bv === null) return -1;
        const cmp = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv, 'pt-BR') : av < bv ? -1 : 1;
        if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
      }
      return b.startedAt - a.startedAt;
    });
  }, [entries, sortKeys, tasksById, pessoasById, clientesById, projetosById]);

  // Agrupamento (quando groupBy != '') · grupos recolhíveis como no Backlog
  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const STATUS_LABEL: Record<string, string> = {
      backlog: 'Backlog',
      andamento: 'Em andamento',
      bloqueado: 'Bloqueado',
      concluido: 'Concluído',
      __sem_task__: '(tarefa removida)',
    };
    const groups = new Map<string, { key: string; label: string; items: TimeEntry[]; totalMs: number }>();
    for (const e of sorted) {
      const t = tasksById.get(e.taskId);
      let key: string;
      let label: string;
      if (groupBy === 'resp') {
        key = e.pessoaId;
        label = pessoasById.get(e.pessoaId)?.nome ?? '—';
      } else if (groupBy === 'cli') {
        key = t?.clienteId ?? '__';
        label = t ? (clientesById.get(t.clienteId)?.nome ?? '—') : e.mascarada ? 'Privado' : '—';
      } else {
        key = t?.status ?? '__sem_task__';
        label = STATUS_LABEL[key] ?? key;
      }
      const cur = groups.get(key) ?? { key, label, items: [], totalMs: 0 };
      cur.items.push(e);
      cur.totalMs += duracaoMs(e);
      groups.set(key, cur);
    }
    return [...groups.values()].sort((a, b) => b.totalMs - a.totalMs);
  }, [groupBy, sorted, tasksById, clientesById, pessoasById]);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  useEffect(() => { setCollapsedGroups([]); }, [groupBy]);
  const toggleGroup = (key: string) =>
    setCollapsedGroups((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  // ============ KPIs · sobre os registros filtrados (e já limitados ao acesso) ============
  const kpis = useMemo(() => {
    const segunda = new Date();
    segunda.setHours(0, 0, 0, 0);
    segunda.setDate(segunda.getDate() - ((segunda.getDay() + 6) % 7));
    const w0 = segunda.getTime();
    const w1 = w0 - 7 * DIA_MS;
    const w2 = w1 - 7 * DIA_MS;
    const d30 = Date.now() - 30 * DIA_MS;
    // W-1 até o mesmo ponto da semana (mesmo dia e hora, 7 dias atrás)
    const w1Corte = Date.now() - 7 * DIA_MS;
    let msW0 = 0, msW1 = 0, msW1Ate = 0, msW2 = 0, ms30 = 0, msPrio = 0, msEstr = 0;
    for (const e of entries) {
      const ms = duracaoMs(e);
      if (e.startedAt >= w0) msW0 += ms;
      else if (e.startedAt >= w1) {
        msW1 += ms;
        if (e.startedAt < w1Corte) msW1Ate += Math.min(ms, w1Corte - e.startedAt);
      }
      else if (e.startedAt >= w2) msW2 += ms;
      if (e.startedAt >= d30) {
        ms30 += ms;
        const t = tasksAnaliseById.get(e.taskId);
        if (t?.prioridade === 'P0' || t?.prioridade === 'P1') msPrio += ms;
        if (t && clientesById.get(t.clienteId)?.tier === 'estrategico') msEstr += ms;
      }
    }
    // Dias úteis (seg a sex) nos últimos 30 dias, contando hoje
    let diasUteis = 0;
    for (let i = 0; i < 30; i++) {
      const dow = new Date(Date.now() - i * DIA_MS).getDay();
      if (dow !== 0 && dow !== 6) diasUteis++;
    }
    const pct = (a: number) => (ms30 > 0 ? Math.round((a / ms30) * 100) : null);
    return {
      msW0, msW1, msW1Ate, msW2,
      // Time todo somado ÷ dias úteis
      mediaDiaMs: diasUteis ? ms30 / diasUteis : null,
      pctPrio: pct(msPrio),
      pctEstr: pct(msEstr),
    };
  }, [entries, tasksAnaliseById, clientesById]);

  async function deleteEntry(id: string) {
    const supabase = createClient();
    await supabase.from('time_entries').delete().eq('id', id);
    removeTimeEntry(id);
  }

  // Edição de registro · admin edita qualquer · interno só self (gate
  // espelha RLS time_entries_self_update / time_entries_admin_all).
  const [editingId, setEditingId] = useState<string | null>(null);
  // Confirmação inline de exclusão · clica X → "excluir/cancelar" inline,
  // segundo clique deleta. ESC limpa o pending.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPendingDelete(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingDelete]);
  async function saveEntry(id: string, startedAt: Date, endedAt: Date, note?: string) {
    const supabase = createClient();
    const startedIso = startedAt.toISOString();
    const endedIso = endedAt.toISOString();
    const { data, error } = await supabase
      .from('time_entries')
      .update({ started_at: startedIso, ended_at: endedIso, note: note ?? null })
      .eq('id', id)
      .select('id, task_id, pessoa_id, started_at, ended_at, note, criado_em, manual')
      .single();
    if (error || !data) {
      setEditingId(null);
      return;
    }
    upsertTimeEntry(timeEntryFromDb(data));
    setEditingId(null);
  }

  const totalMs = useMemo(
    () =>
      entries.reduce((acc, e) => {
        if (!e.endedAt) return acc + (Date.now() - e.startedAt);
        return acc + (e.endedAt - e.startedAt);
      }, 0),
    [entries],
  );

  const staffPessoas = useMemo(
    () => [...pessoasById.values()]
      .filter((p) => (p.role === 'admin' || p.role === 'interno') && p.invited_at !== null)
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    [pessoasById],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-muted text-sm">carregando…</span>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Timesheet"
        right={
          <FilterBar
            f={{
              q: qDraft,
              cliente: filterCliente,
              projeto: filterProjeto,
              resp: filterPessoaId,
              prazo: filterPrazo,
            } satisfies StdFilters}
            set={(key, value) => {
              if (key === 'q') setQDraft(value);
              else if (key === 'cliente') { setFilterCliente(value); setFilterProjeto(''); }
              else if (key === 'projeto') setFilterProjeto(value);
              else if (key === 'resp') setFilterPessoaId(value);
              else if (key === 'prazo') setFilterPrazo(value as typeof filterPrazo);
            }}
            onClear={() => {
              setQDraft('');
              setFilterCliente('');
              setFilterProjeto('');
              setFilterPessoaId('');
              setFilterPrazo('');
              setGroupBy('');
              clearSharedFilters();
            }}
            clienteOptions={clientesAtivos.map((c) => ({ v: c.id, label: c.nome }))}
            projetoOptions={projetosFiltrados.map((p) => ({ v: p.id, label: p.nome }))}
            pessoaOptions={staffPessoas.map((p) => ({ v: p.id, label: p.nome }))}
            // Não-admin não filtra por responsável (sempre vê só os próprios registros)
            show={isAdmin ? ['cliente', 'projeto', 'resp', 'prazo'] : ['cliente', 'projeto', 'prazo']}
            moreItems={[
              { key: 'group-resp', label: groupBy === 'resp' ? 'Agrupando: Responsável ✓' : 'Agrupar: Responsável', kind: 'action', icon: 'users', enabled: isAdmin, onClick: () => setGroupBy(groupBy === 'resp' ? '' : 'resp') },
              { key: 'group-cli', label: groupBy === 'cli' ? 'Agrupando: Cliente ✓' : 'Agrupar: Cliente', kind: 'action', icon: 'building', onClick: () => setGroupBy(groupBy === 'cli' ? '' : 'cli') },
              { key: 'group-status', label: groupBy === 'status' ? 'Agrupando: Status ✓' : 'Agrupar: Status', kind: 'action', icon: 'list-filter', onClick: () => setGroupBy(groupBy === 'status' ? '' : 'status') },
              { key: 'div1', label: '---' },
              { key: 'arquivadas', label: 'Mostrar arquivadas', enabled: false, kind: 'toggle' },
              { key: 'ia', label: 'Somente criadas por IA', enabled: false, kind: 'toggle' },
              { key: 'humano', label: 'Somente criadas por humanos', enabled: false, kind: 'toggle' },
            ] satisfies MoreMenuItem[]}
          />
        }
      />

      {/* KPIs · seguem os filtros da tela; interno só tem as próprias horas */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden mb-6">
        <div className="px-3 md:px-4 py-3 border-b border-line flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">{isAdmin ? 'Horas' : 'Suas horas'}</h2>
          <span className="text-[11px] text-muted">
            total na lista: <b className="text-ink font-semibold">{fmtDuration(totalMs)}</b> · {entries.length} registro{entries.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="p-3 md:p-4 grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
          <TsKpi label="Esta semana" value={fmtHoras(kpis.msW0)} {...variacao(kpis.msW0, kpis.msW1Ate, 'vs semana passada até agora')} />
          <TsKpi label="Semana passada" value={fmtHoras(kpis.msW1)} {...variacao(kpis.msW1, kpis.msW2, 'vs a anterior')} />
          <TsKpi label="Média por dia" value={kpis.mediaDiaMs != null ? fmtHoras(kpis.mediaDiaMs) : '—'} legenda="time · dias úteis · 30 dias" />
          <TsKpi label="P0 e P1" value={kpis.pctPrio != null ? `${kpis.pctPrio}%` : '—'} legenda="últimos 30 dias" />
          <TsKpi label="Clientes estratégicos" value={kpis.pctEstr != null ? `${kpis.pctEstr}%` : '—'} legenda="últimos 30 dias" />
        </div>
      </div>

      {/* Tabela · colunas ordenáveis em cadeia, grupos recolhíveis */}
      {entries.length === 0 ? (
        <div className="text-center py-12 text-muted text-sm">Nenhum registro encontrado.</div>
      ) : (
        <div className="card tbl-wrap">
          <table className="tbl ts-tbl">
            <colgroup>
              <col style={{ width: 130 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 140 }} />
              <col />
              <col style={{ width: 90 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 112 }} />
            </colgroup>
            <thead>
              <tr>
                <TsTh label="Pessoa" k="pessoa" sortBy={sortBy} sortIcon={sortIcon} />
                <TsTh label="Cliente" k="cliente" sortBy={sortBy} sortIcon={sortIcon} />
                <TsTh label="Projeto" k="projeto" sortBy={sortBy} sortIcon={sortIcon} />
                <TsTh label="Tarefa" k="tarefa" sortBy={sortBy} sortIcon={sortIcon} />
                <TsTh label="Data" k="data" sortBy={sortBy} sortIcon={sortIcon} />
                <TsTh label="Total horas" k="duracao" sortBy={sortBy} sortIcon={sortIcon} align="right" />
                <TsTh label="Início" k="inicio" sortBy={sortBy} sortIcon={sortIcon} title="Só para registros do cronômetro" />
                <TsTh label="Fim" k="fim" sortBy={sortBy} sortIcon={sortIcon} title="Só para registros do cronômetro" />
                <th />
              </tr>
            </thead>
            {(grouped ?? [{ key: '__all__', label: '', items: sorted, totalMs }]).map((group) => {
              const fechado = !!grouped && collapsedGroups.includes(group.key);
              return (
                <tbody key={group.key}>
                  {grouped && (
                    <tr className="group-header cursor-pointer" onClick={() => toggleGroup(group.key)}>
                      <td colSpan={9} className="bg-bg-elev hover:bg-brand-tint transition-colors py-2 px-3 border-y border-line">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-muted font-mono text-xs w-3 inline-block">{fechado ? '▸' : '▾'}</span>
                            <span className="font-semibold text-sm text-ink truncate">{group.label}</span>
                          </div>
                          <span className="text-xs font-mono text-muted shrink-0">
                            {fmtDuration(group.totalMs)} · {group.items.length} registro{group.items.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!fechado && group.items.map((e) => {
                    const task = tasksById.get(e.taskId);
                    const pessoa = pessoasById.get(e.pessoaId);
                    const cliente = task ? clientesById.get(task.clienteId) : undefined;
                    const projeto = task ? projetosById.get(task.projetoId) : undefined;
                    const isRunning = !e.endedAt;
                    const canDel = !e.mascarada && (isAdmin || e.pessoaId === currentPessoa?.id);
                    return (
                      <tr key={e.id} className="ts-row">
                        <td className="tbl-resp">{pessoa?.nome ?? '—'}</td>
                        <td className="truncate">{e.mascarada ? <span className="text-muted">—</span> : cliente?.nome ?? '—'}</td>
                        <td className="truncate text-ink-soft">{e.mascarada ? <span className="text-muted">—</span> : projeto?.nome ?? '—'}</td>
                        <td>
                          {e.mascarada ? (
                            <span className="text-muted inline-flex items-center gap-1"><Icon name="lock" size={11} /> Privado</span>
                          ) : task ? (
                            <button
                              type="button"
                              className="text-left hover:text-brand hover:underline truncate max-w-full block"
                              onClick={() => openEdit(e.taskId)}
                            >
                              {task.titulo}
                            </button>
                          ) : (
                            <span className="text-muted">{e.taskId.slice(0, 8)}…</span>
                          )}
                          {e.note && <span className="text-xs text-muted italic block truncate">{e.note}</span>}
                        </td>
                        <td className="font-mono text-xs text-muted">{fmtDateTime(e.startedAt)}</td>
                        <td className={`text-right font-mono font-medium ${isRunning ? 'text-[color:var(--brand)]' : ''}`}>
                          {fmtDuration(duracaoMs(e))}
                        </td>
                        <td className="font-mono text-xs text-muted">{e.manual ? '-' : fmtTime(e.startedAt)}</td>
                        <td className="font-mono text-xs text-muted">
                          {e.manual ? '-' : e.endedAt ? fmtTime(e.endedAt) : <span className="text-[color:var(--brand)]">agora</span>}
                        </td>
                        <td className="text-right relative">
                          {canDel && !isRunning && (
                            <div className="inline-flex items-center gap-2 justify-end">
                              <button
                                type="button"
                                className="text-muted hover:text-brand"
                                onClick={() => setEditingId(e.id)}
                                title="Editar registro"
                              >
                                <Icon name="edit" size={13} />
                              </button>
                              {pendingDelete === e.id ? (
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    className="text-[10px] uppercase font-bold text-[color:var(--danger)] hover:underline"
                                    onClick={async () => {
                                      setPendingDelete(null);
                                      await deleteEntry(e.id);
                                    }}
                                    title="Confirmar exclusão"
                                  >
                                    excluir
                                  </button>
                                  <button
                                    type="button"
                                    className="text-[10px] uppercase font-bold text-muted hover:text-ink"
                                    onClick={() => setPendingDelete(null)}
                                    title="Cancelar"
                                  >
                                    cancelar
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="text-muted hover:text-danger text-base leading-none"
                                  onClick={() => setPendingDelete(e.id)}
                                  title="Excluir registro"
                                >
                                  ×
                                </button>
                              )}
                              {editingId === e.id && (
                                <ManualEntryPopover
                                  taskTitulo={task?.titulo ?? e.taskId.slice(0, 8)}
                                  initial={{
                                    startedAt: new Date(e.startedAt),
                                    endedAt: new Date(e.endedAt ?? e.startedAt),
                                    note: e.note ?? undefined,
                                  }}
                                  onConfirm={(st, en, n) => saveEntry(e.id, st, en, n)}
                                  onCancel={() => setEditingId(null)}
                                />
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}

function TsTh({ label, k, sortBy, sortIcon, align, title }: {
  label: string;
  k: TsKey;
  sortBy: (k: TsKey) => void;
  sortIcon: (k: TsKey) => string;
  align?: 'right';
  title?: string;
}) {
  return (
    <th className={`sortable ${align === 'right' ? 'text-right' : ''}`} onClick={() => sortBy(k)} title={title}>
      {label} <span className="text-[10px] ml-1 text-ink">{sortIcon(k)}</span>
    </th>
  );
}

/** Variação em horas para a linha do card: ▲ +2,1h vs ... */
function variacao(atual: number, base: number, rotulo: string): { legenda: string; sinal: 'up' | 'down' | 'neutral' } {
  const diff = atual - base;
  if (Math.abs(diff) < 60_000) return { legenda: rotulo.replace(/^vs (a )?/, 'igual à '), sinal: 'neutral' };
  return { legenda: `${diff > 0 ? '+' : '−'}${fmtHoras(Math.abs(diff))} ${rotulo}`, sinal: diff > 0 ? 'up' : 'down' };
}

/** Card de KPI do Timesheet: rótulo, número e uma linha (variação ou legenda) */
function TsKpi({ label, value, legenda, sinal }: { label: string; value: string; legenda: string; sinal?: 'up' | 'down' | 'neutral' }) {
  return (
    <div className="bg-elev border border-line rounded-xl p-3 md:p-4 flex flex-col gap-1 min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted leading-none">{label}</div>
      <div className="text-2xl md:text-3xl font-semibold tabular-nums leading-none mt-1 text-[var(--ink)]">{value}</div>
      <div className={cn(
        'text-[11px] mt-0.5 truncate',
        sinal === 'up' ? 'text-[var(--brand)]' : sinal === 'down' ? 'text-[var(--danger)]' : 'text-muted',
      )}>
        {sinal === 'up' ? '▲ ' : sinal === 'down' ? '▼ ' : ''}{legenda}
      </div>
    </div>
  );
}
