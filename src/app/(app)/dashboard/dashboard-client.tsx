'use client';

import { useEffect, useMemo, useState } from 'react';
import { useData, useClientesById, useProjetosById, usePessoasById } from '@/lib/data-store';
import { Icon } from '@/components/icons';
import { useTaskModal } from '@/components/task-modal';
import { PageHeader } from '@/components/page-header';
import { FilterBar, type MoreMenuItem } from '@/components/filter-bar';
import { cn } from '@/lib/utils';
import { atrasada, agingDays, effEsforco, isPreTriagem } from '@/lib/task-utils';
import type { Filters as StdFilters } from '@/lib/filters';
import { getSharedFilters, patchSharedFilters, clearSharedFilters } from '@/lib/shared-filters';
import {
  computeEntregasSemanas,
  computeCalendario,
  computeVolumeByCliente,
  computeCargaByPessoa,
  computeVelocidade,
  computeWeeklyCapacityAnalysis,
} from '@/lib/analytics';
import { VelocidadeOperacao } from '@/components/velocidade-operacao';

// ─────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────

// Heatmap de capacidade · mesmas regras do Briefing
function heatmapColor(nivel: string) {
  if (nivel === 'sobrecarga') return 'bg-[var(--p0-soft)] text-[var(--p0)] font-semibold';
  if (nivel === 'pressao') return 'bg-[var(--p1-soft)] text-[var(--warn)] font-semibold';
  if (nivel === 'ok') return 'bg-[var(--brand-tint)] text-[var(--brand-dark)]';
  return 'bg-[var(--surface-3)] text-[var(--muted)]';
}
const WEEK_LABELS_SHORT = ['Agora', '+1s', '+2s', '+3s'];
const WEEK_LABELS_LONG = ['Esta sem.', 'Próx. sem.', 'Em 2 sem.', 'Em 3 sem.'];

function calDayBg(dia: { count: number; isPast: boolean }) {
  if (dia.count === 0) return '';
  if (dia.isPast || dia.count >= 5) return 'bg-[color:var(--danger-soft)]';
  if (dia.count >= 3) return 'bg-[color:var(--sig-amber-bg)]';
  return 'bg-[color:var(--warn-soft)]';
}

function calBadgeBg(dia: { count: number; isPast: boolean }) {
  if (dia.isPast || dia.count >= 5) return 'bg-[color:var(--danger)]';
  if (dia.count >= 3) return 'bg-[color:var(--sig-amber)]';
  return 'bg-[color:var(--warn)]';
}

// ─────────────────────────────────────────────────────────
//  Sub-componentes
// ─────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-3 md:px-4 py-3 border-b border-line">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  Dashboard
// ─────────────────────────────────────────────────────────

export function DashboardClient() {
  const { tasks, clientes, projetos, pessoas, loading, refreshing } = useData();
  const clientesById = useClientesById();
  const projetosById = useProjetosById();
  const pessoasById = usePessoasById();
  const { openEdit } = useTaskModal();

  const [filterCliente, setFilterCliente] = useState(() => getSharedFilters().cliente);
  const [filterPessoa, setFilterPessoa] = useState(() => getSharedFilters().pessoa);
  const [filterProjeto, setFilterProjeto] = useState(() => getSharedFilters().projeto);
  const [filterPrazo, setFilterPrazo] = useState<'' | 'atrasadas' | 'hoje' | 'semana' | 'sem'>(() => getSharedFilters().prazo);
  useEffect(() => {
    patchSharedFilters({
      cliente: filterCliente,
      projeto: filterProjeto,
      pessoa: filterPessoa,
      prazo: filterPrazo,
    });
  }, [filterCliente, filterProjeto, filterPessoa, filterPrazo]);
  const [onlyIA, setOnlyIA] = useState(false);
  const [onlyHumano, setOnlyHumano] = useState(false);
  const hasFilter = !!(filterCliente || filterPessoa || filterProjeto || filterPrazo || onlyIA || onlyHumano);

  // Pre-triagem (IA criada, sem triada_em) fica fora do Dashboard inteiro
  // — só aparece em /triagem até ser aceita ou rejeitada.
  const baseTasks = useMemo(() => tasks.filter((t) => !t.arquivadoEm && !isPreTriagem(t)), [tasks]);

  const filteredTasks = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const in7Iso = in7.toISOString().slice(0, 10);
    return baseTasks.filter((t) => {
      if (filterCliente && t.clienteId !== filterCliente) return false;
      if (filterPessoa && t.pessoaId !== filterPessoa) return false;
      if (filterProjeto && t.projetoId !== filterProjeto) return false;
      if (onlyIA && !t.criadoPorIa) return false;
      if (onlyHumano && t.criadoPorIa) return false;
      if (filterPrazo === 'atrasadas' && !atrasada(t)) return false;
      if (filterPrazo === 'hoje' && t.prazo !== todayIso) return false;
      if (filterPrazo === 'sem' && t.prazo) return false;
      if (filterPrazo === 'semana') {
        if (!t.prazo) return false;
        if (t.prazo < todayIso || t.prazo > in7Iso) return false;
      }
      return true;
    });
  }, [baseTasks, filterCliente, filterPessoa, filterProjeto, filterPrazo, onlyIA, onlyHumano]);

  // ── KPIs
  const kpiAndamento = useMemo(() => filteredTasks.filter((t) => t.status === 'andamento'), [filteredTasks]);
  const kpiBacklog = useMemo(() => filteredTasks.filter((t) => t.status === 'backlog'), [filteredTasks]);
  const kpiBloqueadas = useMemo(() => filteredTasks.filter((t) => t.status === 'bloqueado'), [filteredTasks]);
  const kpiAtrasadas = useMemo(() => filteredTasks.filter((t) => atrasada(t) && t.status !== 'concluido'), [filteredTasks]);

  // ── Velocidade da operação (movida pro Dashboard em jun/2026)
  const vel = useMemo(() => computeVelocidade(baseTasks), [baseTasks]);

  // ── Entregas + calendário
  const entregasSemanas = useMemo(() => computeEntregasSemanas(filteredTasks), [filteredTasks]);
  const maxEntregasN = Math.max(...entregasSemanas.map((s) => s.count), 1);
  const calendario = useMemo(() => computeCalendario(filteredTasks), [filteredTasks]);
  const calWeeks: typeof calendario[] = [];
  for (let i = 0; i < calendario.length; i += 7) {
    const week = calendario.slice(i, i + 7);
    calWeeks.push([week[6], ...week.slice(0, 6)]);
  }

  // ── Volume + Carga
  const volumeCliente = useMemo(() => computeVolumeByCliente(filteredTasks, clientes), [filteredTasks, clientes]);
  const maxVolume = Math.max(...volumeCliente.map((v) => v.count), 1);
  const cargaPessoa = useMemo(() => computeCargaByPessoa(filteredTasks, pessoas), [filteredTasks, pessoas]);
  const maxCarga = Math.max(...cargaPessoa.map((p) => p.total), 1);

  // ── Capacidade (substituiu Saúde por projeto + por pessoa em jul/2026)
  const wca = useMemo(
    () => computeWeeklyCapacityAnalysis(filteredTasks, clientes, projetos, pessoas),
    [filteredTasks, clientes, projetos, pessoas],
  );
  const pessoasAtivasIds = useMemo(
    () => new Set(pessoas.filter((p) => p.invited_at !== null).map((p) => p.id)),
    [pessoas],
  );
  const pessoasCap = useMemo(
    () => wca.pessoas.filter((p) => pessoasAtivasIds.has(p.pessoaId)),
    [wca.pessoas, pessoasAtivasIds],
  );

  // ── Bottom cards
  const today = new Date().toISOString().slice(0, 10);
  const offsetSeg = (new Date().getDay() + 6) % 7;
  const mondayDate = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - offsetSeg); return d;
  }, [offsetSeg]);
  const mondayStr = mondayDate.toISOString().slice(0, 10);
  const sundayDate = new Date(mondayDate); sundayDate.setDate(mondayDate.getDate() + 7);
  const sundayStr = sundayDate.toISOString().slice(0, 10);

  const p0p1Atrasadas = useMemo(() =>
    filteredTasks
      .filter((t) => (t.prioridade === 'P0' || t.prioridade === 'P1') && atrasada(t) && t.status !== 'concluido')
      .map((t) => ({ ...t, diasAtraso: Math.floor((Date.now() - new Date(t.prazo).getTime()) / 86400000) }))
      .sort((a, b) => b.diasAtraso - a.diasAtraso),
    [filteredTasks],
  );

  const isP0P1 = (t: { prioridade: string }) => t.prioridade === 'P0' || t.prioridade === 'P1';

  const semanaAtualTasks = useMemo(() =>
    filteredTasks
      .filter((t) => isP0P1(t) && t.prazo >= mondayStr && t.prazo < sundayStr && t.status !== 'concluido')
      .sort((a, b) => a.prazo.localeCompare(b.prazo) || a.prioridade.localeCompare(b.prioridade)),
    [filteredTasks, mondayStr, sundayStr],
  );

  const bloqueadasList = useMemo(() => {
    const bpOrder: Record<string, number> = { cliente: 0, nos: 1, terceiro: 2, '': 3 };
    return filteredTasks
      .filter((t) => isP0P1(t) && t.subetapa === 'bloqueado' && t.status !== 'concluido')
      .sort((a, b) => {
        const d = (bpOrder[a.bloqueadoPor] ?? 3) - (bpOrder[b.bloqueadoPor] ?? 3);
        return d !== 0 ? d : agingDays(b) - agingDays(a);
      });
  }, [filteredTasks]);

  // ── Filter options
  const clientesAtivos = useMemo(
    () => clientes.filter((c) => !c.arquivadoEm && !c.ehInterno).sort((a, b) => a.nome.localeCompare(b.nome)),
    [clientes],
  );
  const pessoasAtivas = useMemo(
    () =>
      pessoas
        .filter((p) => p.role !== 'cliente' && p.invited_at !== null)
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [pessoas],
  );
  const projetosAtivos = useMemo(
    () => projetos.filter((p) => !p.arquivadoEm && (!filterCliente || p.clienteId === filterCliente))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    [projetos, filterCliente],
  );

  function clearFilters() {
    setFilterCliente('');
    setFilterPessoa('');
    setFilterProjeto('');
    setFilterPrazo('');
    setOnlyIA(false);
    setOnlyHumano(false);
    clearSharedFilters();
  }

  if (loading) return <div className="text-muted text-sm py-8">Carregando…</div>;

  const selCls = 'text-sm border border-line rounded-lg px-3 py-1.5 bg-elev text-ink focus:outline-none focus:border-[var(--cyan)] min-w-[140px]';

  return (
    <div>
      {/* ── PageHeader + FilterBar (desktop) — bare div: pageheader.mb:24 controla o Y do primeiro elemento ── */}
      <div className="hidden md:block">
        <PageHeader
          title="Dashboard"
          right={
            <FilterBar
              disableSearch
              f={{
                q: '',
                cliente: filterCliente,
                projeto: filterProjeto,
                resp: filterPessoa,
                prazo: filterPrazo,
              } satisfies StdFilters}
              set={(key, value) => {
                if (key === 'cliente') { setFilterCliente(value); setFilterProjeto(''); }
                else if (key === 'projeto') setFilterProjeto(value);
                else if (key === 'resp') setFilterPessoa(value);
                else if (key === 'prazo') setFilterPrazo(value as typeof filterPrazo);
                // 'q' não tem efeito (Dashboard agrega dados — busca textual não faz sentido)
              }}
              onClear={clearFilters}
              clienteOptions={clientesAtivos.map((c) => ({ v: c.id, label: c.nome }))}
              projetoOptions={projetosAtivos.map((p) => ({ v: p.id, label: p.nome }))}
              pessoaOptions={pessoasAtivas.map((p) => ({ v: p.id, label: p.nome }))}
              moreItems={[
                { key: 'group-resp', label: 'Agrupar: Responsável', enabled: false, kind: 'action', icon: 'users' },
                { key: 'group-cli', label: 'Agrupar: Cliente', enabled: false, kind: 'action', icon: 'building' },
                { key: 'group-status', label: 'Agrupar: Status', enabled: false, kind: 'action', icon: 'list-filter' },
                { key: 'div1', label: '---' },
                { key: 'arquivadas', label: 'Mostrar arquivadas', enabled: false, kind: 'toggle', hint: 'Dashboard ignora' },
                { key: 'ia', label: 'Somente criadas por IA', kind: 'toggle', active: onlyIA, onClick: () => { setOnlyIA((v) => !v); setOnlyHumano(false); } },
                { key: 'humano', label: 'Somente criadas por humanos', kind: 'toggle', active: onlyHumano, onClick: () => { setOnlyHumano((v) => !v); setOnlyIA(false); } },
              ] satisfies MoreMenuItem[]}
            />
          }
        />
      </div>

      {/* ── Mobile · título + filtros compactos ── */}
      <div className="md:hidden">
        <div className="m-pagetitle">
          <h1>Dashboard</h1>
          <div className="narr">
            <b>{kpiAndamento.length + kpiBacklog.length + kpiBloqueadas.length}</b> ativas
            <span className="sep">·</span>
            <b>{kpiAtrasadas.length}</b> atrasadas
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <select
            value={filterCliente}
            onChange={(e) => { setFilterCliente(e.target.value); setFilterProjeto(''); }}
            className="inp text-sm"
          >
            <option value="">Todos clientes</option>
            {clientesAtivos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select
            value={filterPessoa}
            onChange={(e) => setFilterPessoa(e.target.value)}
            className="inp text-sm"
          >
            <option value="">Todas pessoas</option>
            {pessoasAtivas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <select
            value={filterProjeto}
            onChange={(e) => setFilterProjeto(e.target.value)}
            className="inp text-sm"
          >
            <option value="">Todos projetos</option>
            {projetosAtivos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <select
            value={filterPrazo}
            onChange={(e) => setFilterPrazo(e.target.value as typeof filterPrazo)}
            className="inp text-sm"
          >
            <option value="">Qualquer prazo</option>
            <option value="atrasadas">Atrasadas</option>
            <option value="hoje">Hoje</option>
            <option value="semana">Esta semana</option>
            <option value="sem">Sem prazo</option>
          </select>
        </div>
        {hasFilter && (
          <button onClick={clearFilters} className="text-xs text-muted underline mb-3">
            ✕ Limpar filtros
          </button>
        )}
      </div>

      <div className="space-y-4 md:space-y-6">
      {/* ── 1. Velocidade da operação · movida do Briefing (jun/2026) ──
           4 cards (W-0 com projeção, W-1, Ciclo, % no prazo).
           Substituiu o grid de 4 KPIs (Em andamento/Backlog/Bloqueadas/Atrasadas)
           + a chart Throughput 12 semanas — densidade equivalente, mais
           acionável (foca em ritmo + previsibilidade vs estado bruto). */}
      <VelocidadeOperacao vel={vel} />

      {/* ── 2. Entregas + Calendário ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">

        {/* Entregas previstas por semana · métrica = quantidade de tasks
            Chart de barras com baseline (border-bottom) no eixo X. */}
        <div className="bg-elev border border-line rounded-xl">
          <SectionHeader title="Entregas previstas por semana" sub="tarefas abertas por semana do prazo (atrasadas em vermelho)" />
          <div className="px-3 md:px-4 pt-4 pb-6">
            <div className="flex items-end gap-1.5 h-44 border-b border-line">
              {entregasSemanas.map((sem, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
                  <div className="text-[10px] text-muted font-mono tabular-nums">
                    {sem.count > 0 ? sem.count : ''}
                  </div>
                  <div
                    className="w-full rounded-t-sm"
                    style={{
                      height: `${Math.max(2, (sem.count / maxEntregasN) * 150)}px`,
                      background: sem.isAtrasada
                        ? (sem.count > 0 ? '#ef4444' : '#fecaca')
                        : sem.isCurrent
                          ? 'var(--brand)'
                          : 'var(--brand-soft)',
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-2">
              {entregasSemanas.map((sem, i) => (
                <div key={i} className="flex-1 text-center text-[10px] truncate"
                  style={{ color: sem.isAtrasada ? 'var(--danger)' : 'var(--muted)' }}>
                  {sem.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Calendário de entregas */}
        <div className="bg-elev border border-line rounded-xl">
          <div className="px-3 md:px-4 py-3 border-b border-line flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-ink">Calendário de entregas</h2>
              <p className="text-[10px] text-muted mt-0.5">tarefas por dia · semana passada + atual + 4</p>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[9px] text-muted shrink-0">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[color:var(--warn-soft)] border border-[color:var(--warn)] inline-block" />1–2</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[color:var(--sig-amber-bg)] border border-[color:var(--sig-amber)] inline-block" />3–4</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[color:var(--danger-soft)] border border-[color:var(--danger)] inline-block" />5+&nbsp;/&nbsp;ATRASADA</span>
            </div>
          </div>
          <div className="p-2 md:p-3">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map((d) => (
                <div key={d} className="text-center text-[9px] font-medium uppercase tracking-wide text-muted">{d}</div>
              ))}
            </div>
            {/* Weeks */}
            {calWeeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                {week.map((dia) => (
                  <div
                    key={dia.date}
                    className={cn(
                      'rounded-md p-1 min-h-[36px] relative text-[10px] leading-none',
                      calDayBg(dia),
                      dia.isWeekend && dia.count === 0 ? 'opacity-40' : '',
                      dia.isToday ? 'ring-1 ring-[var(--brand)]' : '',
                    )}
                  >
                    <span className={cn('font-medium', dia.isPast && dia.count > 0 ? 'text-[color:var(--danger)]' : 'text-[var(--ink)]')}>
                      {new Date(dia.date + 'T12:00:00').getDate()}
                    </span>
                    {dia.count > 0 && (
                      <span className={cn(
                        'absolute bottom-1 right-1 text-white rounded-full flex items-center justify-center font-bold',
                        calBadgeBg(dia),
                      )} style={{ fontSize: 9, minWidth: 16, height: 16, padding: '0 3px' }}>
                        {dia.count}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4. Volume + Carga ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">

        {/* Volume por cliente */}
        <div className="bg-elev border border-line rounded-xl">
          <SectionHeader title="Tarefas abertas por cliente" sub="vermelho = atrasadas" />
          <div className="p-3 md:p-4 flex flex-col gap-1.5">
            {volumeCliente.length === 0 && <p className="text-xs text-muted">Sem dados</p>}
            {volumeCliente.map((v) => (
              <div key={v.clienteId} className="flex items-center gap-2">
                <div className="w-24 text-xs text-right text-muted truncate shrink-0">{v.nome}</div>
                <div className="flex-1 h-5 flex">
                  {(v.count - v.nAtrasadas) > 0 && (
                    <div style={{
                      width: `${((v.count - v.nAtrasadas) / maxVolume) * 100}%`,
                      background: 'var(--brand)',
                      flexShrink: 0,
                      borderRadius: v.nAtrasadas === 0 ? 3 : '3px 0 0 3px',
                    }} />
                  )}
                  {v.nAtrasadas > 0 && (
                    <div style={{
                      width: `${(v.nAtrasadas / maxVolume) * 100}%`,
                      background: '#ef4444',
                      flexShrink: 0,
                      borderRadius: (v.count - v.nAtrasadas) === 0 ? 3 : '0 3px 3px 0',
                    }} />
                  )}
                </div>
                <span className="text-[10px] font-mono text-muted w-6 text-right shrink-0">{v.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Volume por pessoa · simétrico ao "Volume por cliente". Alocação
            em horas vs capacidade fica no Briefing (Weekly Capacity). */}
        <div className="bg-elev border border-line rounded-xl">
          <SectionHeader title="Tarefas abertas por pessoa" sub="vermelho = atrasadas · exclui PMs e clientes" />
          <div className="p-3 md:p-4 flex flex-col gap-1.5">
            {cargaPessoa.length === 0 && <p className="text-xs text-muted">Sem dados</p>}
            {cargaPessoa.map((p) => (
              <div key={p.pessoaId} className="flex items-center gap-2">
                <div className="w-16 text-xs text-right text-muted truncate shrink-0">{p.nome.split(' ')[0]}</div>
                <div className="flex-1 h-5 flex">
                  {(p.total - p.nAtrasadas) > 0 && (
                    <div style={{
                      width: `${((p.total - p.nAtrasadas) / maxCarga) * 100}%`,
                      background: 'var(--brand)',
                      flexShrink: 0,
                      borderRadius: p.nAtrasadas === 0 ? 3 : '3px 0 0 3px',
                    }} />
                  )}
                  {p.nAtrasadas > 0 && (
                    <div style={{
                      width: `${(p.nAtrasadas / maxCarga) * 100}%`,
                      background: '#ef4444',
                      flexShrink: 0,
                      borderRadius: (p.total - p.nAtrasadas) === 0 ? 3 : '0 3px 3px 0',
                    }} />
                  )}
                </div>
                <span className="text-[10px] font-mono text-muted w-6 text-right shrink-0">{p.total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 5. Capacidade · sustentação + time ──
           Substituiu Saúde por projeto/pessoa (jul/2026).
           Layouts espelham os blocos 4 e 6 do Briefing, sem coluna
           "Meta/sem" e sem footer (mais limpo · só semana + %).
           Cards de altura igual via items-stretch + h-full. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-stretch">

        {/* Capacidade · sustentação */}
        <div className="bg-elev border border-line rounded-xl overflow-hidden h-full flex flex-col">
          <SectionHeader title="Capacidade dos contratos de sustentação" sub="% de uso vs orçamento semanal · vermelho = estouro · âmbar = pressão" />
          <div className="overflow-x-auto flex-1">
            {wca.sustentacoes.length === 0 ? (
              <div className="px-4 py-5 text-sm text-muted">Sem dados</div>
            ) : (
              <div className="px-3 md:px-4 py-3" style={{ minWidth: 320 }}>
                <div className="grid gap-1 mb-1.5" style={{ gridTemplateColumns: '150px repeat(4, 1fr)' }}>
                  <div />
                  {WEEK_LABELS_SHORT.map((l, i) => (
                    <div key={l} className="text-center text-[10px] text-muted font-medium uppercase tracking-wide">
                      <span className="md:hidden">{l}</span>
                      <span className="hidden md:inline">{WEEK_LABELS_LONG[i]}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  {wca.sustentacoes.map((s) => {
                    const cliNome = clientesById.get(s.clienteId)?.nome ?? '—';
                    return (
                      <div key={s.projetoId} className="grid gap-1 items-center" style={{ gridTemplateColumns: '150px repeat(4, 1fr)' }}>
                        <div className="text-xs truncate pr-1" title={`${cliNome} · ${s.nome}`}>
                          <span className="text-muted">{cliNome}</span>
                          <span className="text-muted mx-0.5">·</span>
                          <span className="text-ink">{s.nome}</span>
                        </div>
                        {s.weeks.map((wk, i) => (
                          <div key={i} className={cn('text-center text-[11px] py-1.5 rounded font-mono', heatmapColor(wk.nivel))}
                            title={`${wk.hours}h / ${s.capSemanal}h`}>
                            {wk.pctCap != null ? `${wk.pctCap}%` : '—'}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Capacidade · do time */}
        <div className="bg-elev border border-line rounded-xl overflow-hidden h-full flex flex-col">
          <SectionHeader title="Capacidade do time por pessoa" sub="% de capacidade ocupada nas próximas 4 semanas · exclui PMs e clientes" />
          <div className="overflow-x-auto flex-1">
            {pessoasCap.length === 0 ? (
              <div className="px-4 py-5 text-sm text-muted">Sem dados</div>
            ) : (
              <div className="px-3 md:px-4 py-3" style={{ minWidth: 360 }}>
                <div className="grid gap-1 mb-1.5" style={{ gridTemplateColumns: '150px repeat(4, 1fr)' }}>
                  <div />
                  {WEEK_LABELS_SHORT.map((l, i) => (
                    <div key={l} className="text-center text-[10px] text-muted font-medium uppercase tracking-wide">
                      <span className="md:hidden">{l}</span>
                      <span className="hidden md:inline">{WEEK_LABELS_LONG[i]}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  {pessoasCap.map((p) => (
                    <div key={p.pessoaId} className="grid gap-1 items-center" style={{ gridTemplateColumns: '150px repeat(4, 1fr)' }}>
                      <div className="text-xs text-ink truncate pr-1" title={p.nome}>{p.nome}</div>
                      {p.weeks.map((wk, i) => (
                        <div key={i} className={cn('text-center text-[11px] py-1.5 rounded font-mono', heatmapColor(wk.nivel))}
                          title={`${wk.hours}h`}>
                          {wk.pctCap != null ? `${wk.pctCap}%` : '—'}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 6. Bottom cards: P0/P1 atrasadas · semana atual · bloqueadas ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">

        {/* P0/P1 atrasadas */}
        <div className="bg-elev border border-line rounded-xl overflow-hidden flex flex-col">
          <SectionHeader title="Prioridades atrasadas" sub="P0/P1 com prazo vencido e ainda abertas" />
          <div className="flex-1 overflow-y-auto divide-y divide-line" style={{ maxHeight: 320 }}>
            {p0p1Atrasadas.length === 0 && (
              <div className="px-4 py-5 text-sm text-[var(--brand)]">✓ Nenhuma P0/P1 atrasada</div>
            )}
            {p0p1Atrasadas.map((t) => (
              <button
                key={t.id}
                onClick={() => openEdit(t.id)}
                className="w-full text-left flex items-start gap-2 px-3 py-2.5 hover:bg-[var(--surface-3)] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-ink truncate">{t.titulo}</div>
                  <div className="text-[10px] text-muted truncate">
                    {clientesById.get(t.clienteId)?.nome ?? '—'}
                    {t.projetoId && ` · ${projetosById.get(t.projetoId)?.nome ?? ''}`}
                    {t.pessoaId && ` · ${pessoasById.get(t.pessoaId)?.nome?.split(' ')[0] ?? ''}`}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="text-[10px] font-semibold text-[var(--danger)] tabular-nums">{t.diasAtraso}d</span>
                  <span className={cn('text-[9px] px-1 py-0.5 rounded font-mono', t.prioridade === 'P0' ? 'bg-[var(--p0-soft)] text-[var(--danger)]' : 'bg-[var(--p1-soft)] text-[var(--warn)]')}>
                    {t.prioridade}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Semana atual */}
        <div className="bg-elev border border-line rounded-xl overflow-hidden flex flex-col">
          <SectionHeader title="Prioridades para semana atual" sub={`P0/P1 com prazo ${mondayStr} – ${sundayStr.slice(5).replace('-', '/')}`} />
          <div className="flex-1 overflow-y-auto divide-y divide-line" style={{ maxHeight: 320 }}>
            {semanaAtualTasks.length === 0 && (
              <div className="px-4 py-5 text-sm text-muted italic">Nenhuma tarefa com prazo nesta semana</div>
            )}
            {semanaAtualTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => openEdit(t.id)}
                className="w-full text-left flex items-start gap-2 px-3 py-2.5 hover:bg-[var(--surface-3)] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-ink truncate">{t.titulo}</div>
                  <div className="text-[10px] text-muted truncate">
                    {clientesById.get(t.clienteId)?.nome ?? '—'}
                    {t.pessoaId && ` · ${pessoasById.get(t.pessoaId)?.nome?.split(' ')[0] ?? ''}`}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="text-[10px] text-muted tabular-nums">{t.prazo.slice(5).replace('-', '/')}</span>
                  <span className={cn('text-[9px] px-1 py-0.5 rounded font-mono',
                    t.prioridade === 'P0' ? 'bg-[var(--p0-soft)] text-[var(--danger)]' :
                    t.prioridade === 'P1' ? 'bg-[var(--p1-soft)] text-[var(--warn)]' :
                    'bg-[var(--surface-3)] text-muted')}>
                    {t.prioridade}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Bloqueadas */}
        <div className="bg-elev border border-line rounded-xl overflow-hidden flex flex-col">
          <SectionHeader title="Prioridades bloqueadas" sub="P0/P1 aguardando alguma ação externa" />
          <div className="flex-1 overflow-y-auto divide-y divide-line" style={{ maxHeight: 320 }}>
            {bloqueadasList.length === 0 && (
              <div className="px-4 py-5 text-sm text-[var(--brand)]">✓ Nenhuma task bloqueada</div>
            )}
            {bloqueadasList.map((t) => (
              <button
                key={t.id}
                onClick={() => openEdit(t.id)}
                className="w-full text-left flex items-start gap-2 px-3 py-2.5 hover:bg-[var(--surface-3)] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-ink truncate">{t.titulo}</div>
                  <div className="text-[10px] text-muted truncate">
                    {clientesById.get(t.clienteId)?.nome ?? '—'}
                    {t.projetoId && ` · ${projetosById.get(t.projetoId)?.nome ?? ''}`}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="text-[10px] text-muted">
                    {t.bloqueadoPor === 'cliente' ? 'Cliente'
                      : t.bloqueadoPor === 'nos' ? 'Nós'
                      : t.bloqueadoPor === 'terceiro' ? 'Terceiro'
                      : '—'}
                  </span>
                  <span className={cn('text-[9px] px-1 py-0.5 rounded font-mono',
                    t.prioridade === 'P0' ? 'bg-[var(--p0-soft)] text-[var(--danger)]' :
                    t.prioridade === 'P1' ? 'bg-[var(--p1-soft)] text-[var(--warn)]' :
                    'bg-[var(--surface-3)] text-muted')}>
                    {t.prioridade}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>
      </div>
    </div>
  );
}
