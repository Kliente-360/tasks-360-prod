'use client';

import { useEffect, useMemo, useState } from 'react';
import { useData, useClientesById, useProjetosById, usePessoasById } from '@/lib/data-store';
import { Icon } from '@/components/icons';
import { TaskAvatar } from '@/components/task-card/primitives';
import { TaskCard } from '@/components/task-card/task-card';
import { useTaskModal } from '@/components/task-modal';
import { PageHeader } from '@/components/page-header';
import { FilterBar, type MoreMenuItem } from '@/components/filter-bar';
import { cn } from '@/lib/utils';
import { atrasada, agingDays, effEsforco } from '@/lib/task-utils';
import type { Filters as StdFilters } from '@/lib/filters';
import { getSharedFilters, patchSharedFilters, clearSharedFilters } from '@/lib/shared-filters';
import {
  computeThroughput12w,
  computeEntregasSemanas,
  computeCalendario,
  computeVolumeByCliente,
  computeCargaByPessoa,
  computeProjetosSaude,
  computeSaudePorPessoa,
  computeVelocidade,
  type ThroughputWeek12,
  type CargaPessoa,
} from '@/lib/heuristics';
import { VelocidadeOperacao } from '@/components/velocidade-operacao';
import type { Task } from '@/lib/types';

// ─────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────

function sinalDot(sinal: string) {
  if (sinal === 'vermelho') return 'bg-[var(--danger)]';
  if (sinal === 'amarelo') return 'bg-[var(--warn)]';
  return 'bg-[var(--brand)]';
}

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
  const [filtersOpen, setFiltersOpen] = useState(false);

  const hasFilter = !!(filterCliente || filterPessoa || filterProjeto || filterPrazo || onlyIA || onlyHumano);

  const baseTasks = useMemo(() => tasks.filter((t) => !t.arquivadoEm), [tasks]);

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

  // ── Throughput 12w (consumido pelo DashboardMobilePanel — mobile mantém
  //    a chart de bars; desktop usa Velocidade da operação)
  const throughput12 = useMemo(() => computeThroughput12w(baseTasks), [baseTasks]);

  // ── Entregas + calendário
  const entregasSemanas = useMemo(() => computeEntregasSemanas(filteredTasks), [filteredTasks]);
  const maxEntregasH = Math.max(...entregasSemanas.map((s) => s.hours), 1);
  const calendario = useMemo(() => computeCalendario(filteredTasks), [filteredTasks]);
  const calWeeks: typeof calendario[] = [];
  for (let i = 0; i < calendario.length; i += 7) calWeeks.push(calendario.slice(i, i + 7));

  // ── Volume + Carga
  const volumeCliente = useMemo(() => computeVolumeByCliente(filteredTasks, clientes), [filteredTasks, clientes]);
  const maxVolume = Math.max(...volumeCliente.map((v) => v.count), 1);
  const cargaPessoa = useMemo(() => computeCargaByPessoa(filteredTasks, pessoas), [filteredTasks, pessoas]);
  const maxCarga = Math.max(...cargaPessoa.map((p) => p.total), 1);

  // ── Saúde
  const saudeProjeto = useMemo(
    () => computeProjetosSaude(filteredTasks, projetos, clientes),
    [filteredTasks, projetos, clientes],
  );
  const saudePessoa = useMemo(
    () => computeSaudePorPessoa(filteredTasks, pessoas),
    [filteredTasks, pessoas],
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
    () => pessoas.filter((p) => p.role !== 'cliente').sort((a, b) => a.nome.localeCompare(b.nome)),
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

      {/* ── Mobile · MDashboard (handoff §3 · novo painel) ── */}
      <DashboardMobilePanel
        filteredTasks={filteredTasks}
        kpiAndamento={kpiAndamento.length}
        kpiBacklog={kpiBacklog.length}
        kpiBloqueadas={kpiBloqueadas.length}
        kpiAtrasadas={kpiAtrasadas.length}
        throughput12={throughput12}
        cargaPessoa={cargaPessoa}
        clientesById={clientesById}
        projetosById={projetosById}
        pessoasById={pessoasById}
        onOpen={openEdit}
      />

      {/* ── Filtros (mobile legacy — escondido pela DashboardMobilePanel; source preservado) ── */}
      <div className="hidden" style={{ display: 'none' }}>
        <div className="flex items-center gap-2 md:hidden">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
              hasFilter
                ? 'bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand-dark)] font-medium'
                : 'bg-elev border-line text-muted',
            )}
          >
            <span>Filtrar</span>
            {hasFilter && (
              <span className="bg-[var(--brand)] text-white rounded-full px-1.5 py-0.5 font-bold leading-none" style={{ fontSize: 10 }}>
                {[filterCliente, filterPessoa, filterProjeto].filter(Boolean).length}
              </span>
            )}
            <span style={{ fontSize: 9, opacity: 0.6 }}>{filtersOpen ? '▴' : '▾'}</span>
          </button>
          {hasFilter && <button onClick={clearFilters} className="text-xs text-muted underline">Limpar</button>}
          {refreshing && <span className="text-xs text-muted ml-auto">atualizando…</span>}
        </div>
        {filtersOpen && (
          <div className="mt-2 p-3 bg-elev border border-line rounded-xl flex flex-col gap-2 md:hidden">
            <select value={filterCliente} onChange={(e) => { setFilterCliente(e.target.value); setFilterProjeto(''); }} className="text-sm border border-line rounded-lg px-3 py-2.5 bg-[var(--surface-3)] text-ink w-full">
              <option value="">Todos clientes</option>
              {clientesAtivos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select value={filterPessoa} onChange={(e) => setFilterPessoa(e.target.value)} className="text-sm border border-line rounded-lg px-3 py-2.5 bg-[var(--surface-3)] text-ink w-full">
              <option value="">Todas pessoas</option>
              {pessoasAtivas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <select value={filterProjeto} onChange={(e) => setFilterProjeto(e.target.value)} className="text-sm border border-line rounded-lg px-3 py-2.5 bg-[var(--surface-3)] text-ink w-full">
              <option value="">Todos projetos</option>
              {projetosAtivos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        )}
        {/* Desktop filtros agora vivem dentro do FilterBar no PageHeader acima */}
      </div>

      <div className="hidden md:block space-y-4 md:space-y-6">
      {/* ── 1. Velocidade da operação · movida do Briefing (jun/2026) ──
           4 cards (W-0 com projeção, W-1, Ciclo, % no prazo).
           Substituiu o grid de 4 KPIs (Em andamento/Backlog/Bloqueadas/Atrasadas)
           + a chart Throughput 12 semanas — densidade equivalente, mais
           acionável (foca em ritmo + previsibilidade vs estado bruto). */}
      <VelocidadeOperacao vel={vel} />

      {/* ── 2. Entregas + Calendário ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">

        {/* Entregas semana atual + 4 */}
        <div className="bg-elev border border-line rounded-xl">
          <SectionHeader title="Entregas — semana atual + 4" sub="horas de tarefas abertas por semana do prazo (atrasadas em vermelho)" />
          <div className="p-3 md:p-4">
            <div className="flex items-end gap-1.5 h-36">
              {entregasSemanas.map((sem, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="text-[9px] text-muted tabular-nums">
                    {sem.hours > 0 ? `${Math.round(sem.hours)}h` : ''}
                  </div>
                  <div
                    className="w-full rounded-t-sm min-h-[3px]"
                    style={{
                      height: `${Math.max(3, (sem.hours / maxEntregasH) * 110)}px`,
                      background: sem.isAtrasada
                        ? (sem.hours > 0 ? '#ef4444' : '#fecaca')
                        : sem.isCurrent
                          ? 'var(--brand)'
                          : 'var(--brand-soft)',
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-1.5">
              {entregasSemanas.map((sem, i) => (
                <div key={i} className="flex-1 text-center text-[9px] truncate"
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
              {['SEG','TER','QUA','QUI','SEX','SÁB','DOM'].map((d) => (
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
          <SectionHeader title="Volume por cliente" sub="tasks abertas · vermelho = atrasadas" />
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

        {/* Carga por pessoa */}
        <div className="bg-elev border border-line rounded-xl">
          <SectionHeader title="Carga por pessoa" sub="tasks abertas · vermelho = tasks atrasadas" />
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

      {/* ── 5. Saúde por projeto + por pessoa ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">

        {/* Saúde por projeto */}
        <div className="bg-elev border border-line rounded-xl overflow-hidden">
          <SectionHeader title="Saúde por projeto" sub="semáforo: vermelho = atrasadas / SLA / bloqueio >5d · âmbar = bloqueio interno" />
          {saudeProjeto.length === 0
            ? <div className="px-4 py-5 text-sm text-muted">Nenhum projeto ativo</div>
            : (
              <div className="divide-y divide-line">
                {saudeProjeto.map((ps) => (
                  <div key={ps.projetoId} className="flex items-start gap-3 px-3 md:px-4 py-2.5">
                    <span className={cn('shrink-0 w-2.5 h-2.5 rounded-full mt-1', sinalDot(ps.sinal))} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink truncate">{ps.nome}</div>
                      <div className="text-xs text-muted">{ps.nomeCliente}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted">{ps.nAbertas} aberta(s)</div>
                      {ps.motivo !== 'Saudável' && (
                        <div className="text-[10px] text-[var(--danger)]">{ps.motivo}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Saúde por pessoa */}
        <div className="bg-elev border border-line rounded-xl overflow-hidden">
          <SectionHeader title="Saúde por pessoa" sub="semáforo: vermelho = atrasadas ou paradas ≥3 · âmbar = aguard. cliente / bloqueio / parada" />
          {saudePessoa.length === 0
            ? <div className="px-4 py-5 text-sm text-muted">Sem dados</div>
            : (
              <div className="divide-y divide-line">
                {saudePessoa.map((ps) => (
                  <div key={ps.pessoaId} className="flex items-start gap-3 px-3 md:px-4 py-2.5">
                    <span className={cn('shrink-0 w-2.5 h-2.5 rounded-full mt-1', sinalDot(ps.sinal))} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{ps.nome}</div>
                      <div className="text-[10px] text-muted">{ps.nTasks} tarefa(s) · {ps.totalHoras}h</div>
                    </div>
                    <div className="text-right shrink-0 text-[10px] space-y-0.5">
                      {ps.nAtrasadas > 0 && <div className="text-[var(--danger)]">{ps.nAtrasadas} atras.</div>}
                      {ps.nAguardCliente > 0 && <div className="text-[var(--warn)]">{ps.nAguardCliente} aguard.</div>}
                      {ps.nBloqueadas > 0 && <div className="text-[var(--warn)]">{ps.nBloqueadas} bloq.</div>}
                      {ps.nParadas > 0 && <div className="text-muted">{ps.nParadas} parada(s)</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* ── 6. Bottom cards: P0/P1 atrasadas · semana atual · bloqueadas ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">

        {/* P0/P1 atrasadas */}
        <div className="bg-elev border border-line rounded-xl overflow-hidden flex flex-col">
          <SectionHeader title="P0 e P1 atrasadas" sub="prazo vencido e ainda abertas" />
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
          <SectionHeader title="Semana atual · P0/P1" sub={`prazo ${mondayStr} – ${sundayStr.slice(5).replace('-', '/')}`} />
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
          <SectionHeader title="Bloqueadas · P0/P1" sub="aguardando alguma ação externa" />
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
                  <span className="text-[10px] text-muted tabular-nums">{effEsforco(t)}h</span>
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

// ============================================================
// MOBILE · MDashboard (handoff §3 · DashboardMobilePanel)
// ============================================================
// 4 KPIs em grid 2x2 + 3 .m-sec: Throughput (12 bars · última verde),
// Carga por pessoa (loadrow com fill verde / warn se >85%), Precisa de
// atenção (top 3 tasks atrasadas ou P0 como tcard). Sem filtros próprios
// — usa o estado da árvore desktop (compartilhado via shared-filters).

function DashboardMobilePanel({
  filteredTasks,
  kpiAndamento,
  kpiBacklog,
  kpiBloqueadas,
  kpiAtrasadas,
  throughput12,
  cargaPessoa,
  clientesById,
  projetosById,
  pessoasById,
  onOpen,
}: {
  filteredTasks: Task[];
  kpiAndamento: number;
  kpiBacklog: number;
  kpiBloqueadas: number;
  kpiAtrasadas: number;
  throughput12: ThroughputWeek12[];
  cargaPessoa: CargaPessoa[];
  clientesById: Map<string, { nome: string }>;
  projetosById: Map<string, { nome: string }>;
  pessoasById: Map<string, { nome: string }>;
  onOpen: (id: string) => void;
}) {
  const totalAbertas = kpiAndamento + kpiBacklog + kpiBloqueadas;
  const throughputAtual = throughput12[throughput12.length - 1]?.total ?? 0;
  const maxTotal = Math.max(...throughput12.map((w) => w.total), 1);
  const maxCarga = Math.max(...cargaPessoa.map((p) => p.total), 1);

  // Top 3 "precisa de atenção": atrasadas + P0 abertas (sem repetir)
  const atencao = useMemo(() => {
    const set = new Set<string>();
    const out: Task[] = [];
    for (const t of filteredTasks) {
      if (t.status === 'concluido') continue;
      const isAtrasada = atrasada(t);
      const isP0 = t.prioridade === 'P0';
      if (!isAtrasada && !isP0) continue;
      if (set.has(t.id)) continue;
      set.add(t.id);
      out.push(t);
      if (out.length >= 3) break;
    }
    return out;
  }, [filteredTasks]);

  return (
    <div className="md:hidden">
      <div className="m-pagetitle">
        <h1>Visão geral</h1>
        <div className="narr">
          <b>{totalAbertas}</b> ativas
          <span className="sep">·</span>
          throughput <b>{throughputAtual}</b>/sem
        </div>
      </div>

      {/* KPIs 2×2 */}
      <div className="m-kpis">
        <MobileKpi label="Em andamento" value={kpiAndamento} />
        <MobileKpi label="Backlog" value={kpiBacklog} />
        <MobileKpi label="Bloqueadas" value={kpiBloqueadas} />
        <MobileKpi label="Atrasadas" value={kpiAtrasadas} danger={kpiAtrasadas > 0} />
      </div>

      {/* Throughput 12 semanas */}
      <div className="m-sec mt14">
        <div className="h">
          <div>
            <h3>Throughput</h3>
            <div className="sub">concluídas / semana · 12 sem</div>
          </div>
        </div>
        <div className="body">
          <div className="bars">
            {throughput12.map((w, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div
                  className={cn('bar', i === throughput12.length - 1 && 'now')}
                  style={{ height: `${(w.total / maxTotal) * 100}%` }}
                  title={`${w.label}: ${w.total}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Carga por pessoa */}
      <div className="m-sec mt14">
        <div className="h"><h3>Carga por pessoa</h3></div>
        <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cargaPessoa.slice(0, 8).map((c) => {
            const pct = Math.round((c.total / maxCarga) * 100);
            const over = pct > 85;
            return (
              <div key={c.pessoaId} className="loadrow">
                <TaskAvatar name={c.nome} />
                <div className="track">
                  <div className={cn('fill', over && 'over')} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <span className="pct">{pct}%</span>
              </div>
            );
          })}
          {cargaPessoa.length === 0 && (
            <div className="text-muted text-xs italic text-center py-2">Sem dados de carga.</div>
          )}
        </div>
      </div>

      {/* Precisa de atenção */}
      <div className="m-sec mt14">
        <div className="h">
          <div>
            <h3>Precisa de atenção</h3>
            <div className="sub">priorize hoje</div>
          </div>
        </div>
        <div className="m-list" style={{ padding: 12, gap: 9 }}>
          {atencao.length === 0 ? (
            <div className="text-muted text-xs italic text-center py-2">Nada urgente. Bom dia.</div>
          ) : (
            atencao.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                cliente={clientesById.get(t.clienteId)?.nome ?? '—'}
                projeto={projetosById.get(t.projetoId)?.nome}
                respNome={pessoasById.get(t.pessoaId)?.nome ?? '—'}
                size="md"
                onClick={() => onOpen(t.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MobileKpi({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={cn('kpi', danger && 'danger')}>
      <div className="lab">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}
