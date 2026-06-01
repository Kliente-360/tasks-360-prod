'use client';

/**
 * Dashboard · cockpit operacional — Onda 1
 * Mobile-first: título oculto (tab bar já indica contexto),
 * filtros colapsáveis, heatmap compacto, throughput sem labels mobile.
 */

import { useMemo, useState } from 'react';
import { useData } from '@/lib/data-store';
import { cn } from '@/lib/utils';
import { atrasada } from '@/lib/task-utils';
import {
  computeHeuristicAlerts,
  computeWeeklyCapacityAnalysis,
  computeProjetosSaude,
  computeThroughput,
  type HeuristicAlert,
} from '@/lib/heuristics';

// ─────────────────────────────────────────────────────────
//  Helpers visuais
// ─────────────────────────────────────────────────────────

function severityColor(s: string) {
  if (s === 'alta') return 'text-[var(--danger)] bg-[var(--p0-soft)] border-[var(--p0)]';
  if (s === 'media') return 'text-[var(--warn)] bg-[var(--p1-soft)] border-[var(--p1)]';
  return 'text-[var(--muted)] bg-[var(--surface-3)] border-[var(--line)]';
}

function heatmapColor(nivel: string) {
  if (nivel === 'sobrecarga') return 'bg-[var(--p0-soft)] text-[var(--p0)] font-semibold';
  if (nivel === 'pressao') return 'bg-[var(--p1-soft)] text-[var(--warn)] font-semibold';
  if (nivel === 'ok') return 'bg-[var(--brand-tint)] text-[var(--brand-dark)]';
  return 'bg-[var(--surface-3)] text-[var(--muted)]';
}

function sinalDot(sinal: string) {
  if (sinal === 'vermelho') return 'bg-[var(--danger)]';
  if (sinal === 'amarelo') return 'bg-[var(--warn)]';
  return 'bg-[var(--brand)]';
}

// ─────────────────────────────────────────────────────────
//  Componentes auxiliares
// ─────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  delta,
  deltaSign,
  sub,
  danger,
}: {
  label: string;
  value: number | string;
  delta?: string;
  deltaSign?: 'up' | 'down' | 'neutral';
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div className="bg-elev border border-line rounded-xl p-3 md:p-4 flex flex-col gap-1 min-w-0">
      <div className="text-[10px] md:text-[11px] font-medium uppercase tracking-[0.12em] text-muted leading-none">
        {label}
      </div>
      <div
        className={cn(
          'text-2xl md:text-3xl font-semibold tabular-nums leading-none mt-1',
          danger && Number(value) > 0 ? 'text-[var(--danger)]' : 'text-[var(--ink)]',
        )}
      >
        {value}
      </div>
      {delta && (
        <div
          className={cn(
            'text-[11px] mt-0.5',
            deltaSign === 'up'
              ? 'text-[var(--brand)]'
              : deltaSign === 'down'
              ? 'text-[var(--danger)]'
              : 'text-muted',
          )}
        >
          {deltaSign === 'up' ? '▲' : deltaSign === 'down' ? '▼' : '●'} {delta}
        </div>
      )}
      {sub && <div className="text-[10px] text-muted hidden md:block mt-0.5">{sub}</div>}
    </div>
  );
}

function HeuristicRow({ alert, expanded }: { alert: HeuristicAlert; expanded: boolean }) {
  return (
    <div className={cn('border rounded-lg px-3 py-2.5 text-sm', severityColor(alert.severity))}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-xs font-bold mt-0.5 opacity-60">
          {alert.severity === 'alta' ? '●' : '○'}
        </span>
        <div className="min-w-0">
          <div className="font-medium leading-snug text-[13px]">{alert.titulo}</div>
          {expanded && alert.detalhe && (
            <div className="text-xs opacity-75 mt-1">{alert.detalhe}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  Dashboard principal
// ─────────────────────────────────────────────────────────

export function DashboardClient() {
  const { tasks, clientes, projetos, pessoas, loading, refreshing } = useData();

  const [filterCliente, setFilterCliente] = useState('');
  const [filterPessoa, setFilterPessoa] = useState('');
  const [filterProjeto, setFilterProjeto] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [heurExpanded, setHeurExpanded] = useState(false);
  const [heurFilter, setHeurFilter] = useState<'' | 'alta' | 'media'>('');

  const hasFilter = !!(filterCliente || filterPessoa || filterProjeto);

  const baseTasks = useMemo(() => tasks.filter((t) => !t.arquivadoEm), [tasks]);

  const filteredTasks = useMemo(
    () =>
      baseTasks.filter((t) => {
        if (filterCliente && t.clienteId !== filterCliente) return false;
        if (filterPessoa && t.pessoaId !== filterPessoa) return false;
        if (filterProjeto && t.projetoId !== filterProjeto) return false;
        return true;
      }),
    [baseTasks, filterCliente, filterPessoa, filterProjeto],
  );

  const throughput = useMemo(() => computeThroughput(baseTasks), [baseTasks]);
  const throughputW1 = throughput[throughput.length - 2]?.count ?? 0;
  const throughputW2 = throughput[throughput.length - 3]?.count ?? 0;
  const throughputDelta = throughputW1 - throughputW2;

  const abertas = useMemo(() => filteredTasks.filter((t) => t.status !== 'concluido'), [filteredTasks]);
  const atrasadas = useMemo(() => abertas.filter((t) => atrasada(t)), [abertas]);

  const projetosSaude = useMemo(
    () => computeProjetosSaude(filteredTasks, projetos, clientes),
    [filteredTasks, projetos, clientes],
  );
  const projsEmRisco = projetosSaude.filter((p) => p.sinal !== 'verde').length;

  const heuristicAlerts = useMemo(
    () => computeHeuristicAlerts(baseTasks, clientes, projetos, pessoas),
    [baseTasks, clientes, projetos, pessoas],
  );
  const alertsToShow = heurFilter
    ? heuristicAlerts.filter((a) => a.severity === heurFilter)
    : heuristicAlerts;
  const countAlta = heuristicAlerts.filter((a) => a.severity === 'alta').length;
  const countMedia = heuristicAlerts.filter((a) => a.severity === 'media').length;

  const wca = useMemo(
    () => computeWeeklyCapacityAnalysis(baseTasks, clientes, projetos, pessoas),
    [baseTasks, clientes, projetos, pessoas],
  );

  const clientesAtivos = useMemo(
    () =>
      clientes
        .filter((c) => !c.arquivadoEm && !c.ehInterno)
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [clientes],
  );
  const pessoasAtivas = useMemo(
    () =>
      pessoas.filter((p) => p.role !== 'cliente').sort((a, b) => a.nome.localeCompare(b.nome)),
    [pessoas],
  );
  const projetosAtivos = useMemo(
    () =>
      projetos
        .filter((p) => !p.arquivadoEm && (!filterCliente || p.clienteId === filterCliente))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [projetos, filterCliente],
  );

  // Labels compactos no heatmap: mobile usa W0/W1/W2/W3, desktop usa por extenso
  const weekLabelsMobile = ['Agora', '+1s', '+2s', '+3s'];
  const weekLabelsDesktop = ['Esta sem.', 'Próx. sem.', 'Em 2 sem.', 'Em 3 sem.'];

  const maxThroughput = Math.max(...throughput.map((w) => w.count), 1);

  function clearFilters() {
    setFilterCliente('');
    setFilterPessoa('');
    setFilterProjeto('');
  }

  if (loading) {
    return <div className="text-muted text-sm py-8">Carregando…</div>;
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">

      {/* ── Page bar · desktop only (mobile: tab bar já diz "Dashboard") ── */}
      <div className="page-bar hidden md:flex">
        <div className="page-bar-info">
          <span className="page-bar-narrative">
            Dashboard
            <span className="text-muted font-normal text-sm ml-2">
              {refreshing ? '· atualizando…' : '· cockpit operacional'}
            </span>
          </span>
        </div>
        <div className="page-bar-controls" />
      </div>

      {/* ── Filtros ── */}
      {/* Mobile: botão colapsável compacto */}
      <div>
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
          {hasFilter && (
            <button onClick={clearFilters} className="text-xs text-muted underline">
              Limpar
            </button>
          )}
          {refreshing && (
            <span className="text-xs text-muted ml-auto">atualizando…</span>
          )}
        </div>

        {/* Mobile: painel expansível */}
        {filtersOpen && (
          <div className="mt-2 p-3 bg-elev border border-line rounded-xl flex flex-col gap-2 md:hidden">
            <select
              value={filterCliente}
              onChange={(e) => { setFilterCliente(e.target.value); setFilterProjeto(''); }}
              className="text-sm border border-line rounded-lg px-3 py-2.5 bg-[var(--surface-3)] text-ink w-full"
            >
              <option value="">Todos clientes</option>
              {clientesAtivos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select
              value={filterPessoa}
              onChange={(e) => setFilterPessoa(e.target.value)}
              className="text-sm border border-line rounded-lg px-3 py-2.5 bg-[var(--surface-3)] text-ink w-full"
            >
              <option value="">Todas pessoas</option>
              {pessoasAtivas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <select
              value={filterProjeto}
              onChange={(e) => setFilterProjeto(e.target.value)}
              className="text-sm border border-line rounded-lg px-3 py-2.5 bg-[var(--surface-3)] text-ink w-full"
            >
              <option value="">Todos projetos</option>
              {projetosAtivos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        )}

        {/* Desktop: inline como antes */}
        <div className="hidden md:flex flex-wrap gap-2">
          <select
            value={filterCliente}
            onChange={(e) => { setFilterCliente(e.target.value); setFilterProjeto(''); }}
            className="text-sm border border-line rounded-lg px-3 py-1.5 bg-elev text-ink focus:outline-none focus:border-[var(--cyan)] min-w-[140px]"
          >
            <option value="">Todos clientes</option>
            {clientesAtivos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select
            value={filterPessoa}
            onChange={(e) => setFilterPessoa(e.target.value)}
            className="text-sm border border-line rounded-lg px-3 py-1.5 bg-elev text-ink focus:outline-none focus:border-[var(--cyan)] min-w-[140px]"
          >
            <option value="">Todas pessoas</option>
            {pessoasAtivas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <select
            value={filterProjeto}
            onChange={(e) => setFilterProjeto(e.target.value)}
            className="text-sm border border-line rounded-lg px-3 py-1.5 bg-elev text-ink focus:outline-none focus:border-[var(--cyan)] min-w-[140px]"
          >
            <option value="">Todos projetos</option>
            {projetosAtivos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          {hasFilter && (
            <button onClick={clearFilters} className="text-xs text-muted hover:text-ink underline px-1">
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* ── Bloco 1 · KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <KpiCard
          label="Throughput W-1"
          value={throughputW1}
          delta={throughputDelta !== 0 ? `${Math.abs(throughputDelta)} vs W-2` : 'igual a W-2'}
          deltaSign={throughputDelta > 0 ? 'up' : throughputDelta < 0 ? 'down' : 'neutral'}
          sub="tasks concluídas"
        />
        <KpiCard
          label="Tasks abertas"
          value={abertas.length}
          sub={hasFilter ? 'no filtro' : 'total ativas'}
        />
        <KpiCard
          label="Atrasadas"
          value={atrasadas.length}
          sub="com prazo vencido"
          danger
        />
        <KpiCard
          label="Em atenção"
          value={projsEmRisco}
          sub="projetos âmbar/vermelho"
          danger={projsEmRisco > 0}
        />
      </div>

      {/* ── Bloco 2 · Heurísticas ── */}
      <div className="bg-elev border border-line rounded-xl p-3 md:p-4">
        {/* Header — duas linhas no mobile, uma linha no desktop */}
        <div className="flex flex-col gap-2 mb-3">
          {/* Linha 1: título + badges */}
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">Alertas</h2>
            {countAlta > 0 && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--p0-soft)] text-[var(--danger)]">
                {countAlta} crítico{countAlta > 1 ? 's' : ''}
              </span>
            )}
            {countMedia > 0 && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--p1-soft)] text-[var(--warn)]">
                {countMedia} atenção
              </span>
            )}
            {heuristicAlerts.length === 0 && (
              <span className="text-[11px] text-[var(--brand)]">✓ tudo certo</span>
            )}
          </div>
          {/* Linha 2: controles — filtros de severidade apenas desktop */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex gap-1">
              {(['', 'alta', 'media'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setHeurFilter(f)}
                  className={cn(
                    'text-xs px-2 py-1 rounded border transition-colors',
                    heurFilter === f
                      ? 'bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand-dark)] font-medium'
                      : 'border-line text-muted',
                  )}
                >
                  {f === '' ? 'Todos' : f === 'alta' ? 'Críticos' : 'Atenção'}
                </button>
              ))}
            </div>
            <div className="flex-1 md:hidden" />
            <button
              onClick={() => setHeurExpanded((v) => !v)}
              className="text-xs text-muted hover:text-ink shrink-0"
            >
              {heurExpanded ? 'Menos ▴' : 'Detalhe ▾'}
            </button>
          </div>
        </div>

        {alertsToShow.length === 0 ? (
          <div className="text-sm text-muted py-1">
            {heuristicAlerts.length === 0 ? '✓ Nenhum alerta no momento' : 'Nenhum alerta nesta categoria'}
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {alertsToShow.map((a, i) => (
              <HeuristicRow key={i} alert={a} expanded={heurExpanded} />
            ))}
          </div>
        )}
      </div>

      {/* ── Bloco 3 · Semáforo de projetos ── */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden">
        <div className="px-3 md:px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">Saúde por projeto</h2>
        </div>
        {projetosSaude.length === 0 ? (
          <div className="px-4 py-5 text-sm text-muted">Nenhum projeto ativo no filtro</div>
        ) : (
          <div className="divide-y divide-line">
            {projetosSaude.map((ps) => (
              <div
                key={ps.projetoId}
                className="flex items-center gap-3 px-3 md:px-4 py-3"
              >
                <span
                  className={cn('shrink-0 w-2.5 h-2.5 rounded-full', sinalDot(ps.sinal))}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink truncate">{ps.nome}</div>
                  {/* Mobile: motivo na segunda linha; Desktop: inline */}
                  <div className="text-xs text-muted truncate">
                    <span>{ps.nomeCliente}</span>
                    <span className="md:hidden">
                      {ps.motivo !== 'Saudável' && ` · ${ps.motivo}`}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted shrink-0 hidden md:block">{ps.motivo}</div>
                <div className="text-xs tabular-nums shrink-0 text-right">
                  <span className="text-muted">{ps.nAbertas}</span>
                  {ps.nAtrasadas > 0 && (
                    <span className="text-[var(--danger)] ml-1 font-medium">
                      · {ps.nAtrasadas}↑
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Bloco 4 · Heatmap capacidade ── */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden">
        <div className="px-3 md:px-4 py-3 border-b border-line flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Capacidade · 4 semanas</h2>
          <div className="flex items-center gap-2 md:gap-3 text-[10px] text-muted shrink-0">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-[var(--p0-soft)] inline-block border border-[var(--p0)] border-opacity-30" />
              <span className="hidden sm:inline">Sobrecarga</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-[var(--p1-soft)] inline-block border border-[var(--p1)] border-opacity-30" />
              <span className="hidden sm:inline">Pressão</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-[var(--brand-tint)] inline-block" />
              <span className="hidden sm:inline">OK</span>
            </span>
          </div>
        </div>
        {wca.pessoas.length === 0 ? (
          <div className="px-4 py-5 text-sm text-muted">Nenhum dado de capacidade</div>
        ) : (
          <div className="overflow-x-auto">
            {/* Mobile: col nome 72px; Desktop: 120px */}
            <div className="px-3 md:px-4 py-3" style={{ minWidth: 300 }}>
              {/* Header */}
              <div
                className="grid gap-1 mb-1.5"
                style={{ gridTemplateColumns: 'var(--name-col, 72px) repeat(4, 1fr)' }}
              >
                <div />
                {weekLabelsMobile.map((l, i) => (
                  <div key={l} className="text-center text-[10px] text-muted font-medium uppercase tracking-wide">
                    <span className="md:hidden">{weekLabelsMobile[i]}</span>
                    <span className="hidden md:inline">{weekLabelsDesktop[i]}</span>
                  </div>
                ))}
              </div>
              {/* Rows */}
              <div className="space-y-1">
                {wca.pessoas.map((p) => (
                  <div
                    key={p.pessoaId}
                    className="grid gap-1 items-center"
                    style={{ gridTemplateColumns: 'var(--name-col, 72px) repeat(4, 1fr)' }}
                  >
                    <div
                      className="text-xs text-ink truncate pr-1"
                      title={p.nome}
                    >
                      {p.nome.split(' ')[0]}
                    </div>
                    {p.weeks.map((wk, i) => (
                      <div
                        key={i}
                        className={cn(
                          'text-center text-[11px] py-1.5 rounded font-mono',
                          heatmapColor(wk.nivel),
                        )}
                        title={`${wk.hours}h`}
                      >
                        {wk.pctCap != null ? `${wk.pctCap}%` : '—'}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {wca.pessoas.some((p) => p.capacidade === 0) && (
                <p className="text-[10px] text-muted mt-2">* Sem capacidade → % não calculado</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bloco 5 · Throughput ── */}
      <div className="bg-elev border border-line rounded-xl p-3 md:p-4">
        <h2 className="text-sm font-semibold text-ink mb-3">
          Throughput · 8 semanas
        </h2>
        <div className="flex items-end gap-1 h-24 md:h-28">
          {throughput.map((week, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="text-[10px] text-muted tabular-nums">{week.count || ''}</div>
              <div
                className={cn(
                  'w-full rounded-t-sm',
                  week.isCurrent ? 'bg-[var(--brand)]' : 'bg-[var(--brand-soft)]',
                )}
                style={{ height: `${Math.max(3, (week.count / maxThroughput) * 70)}px` }}
              />
            </div>
          ))}
        </div>
        {/* Labels de data: hidden no mobile (barras falam por si), visíveis no desktop */}
        <div className="hidden md:flex gap-1.5 mt-1.5">
          {throughput.map((week, i) => (
            <div key={i} className="flex-1 text-center text-[9px] text-muted truncate">
              {week.label}
            </div>
          ))}
        </div>
        {/* Mobile: só semana atual */}
        <div className="flex justify-end mt-1 md:hidden">
          <span className="text-[10px] text-muted">
            ← semanas anteriores · semana atual{' '}
            <span className="inline-block w-2 h-2 rounded-sm bg-[var(--brand)] align-middle" />
          </span>
        </div>
      </div>
    </div>
  );
}
