'use client';

import { useMemo, useState } from 'react';
import { useData } from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
import { PageHeader } from '@/components/page-header';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { atrasada } from '@/lib/task-utils';
import {
  computeWeeklyCapacityAnalysis,
  computeProjetosSaude,
  computeHeuristicAlerts,
  computeVelocidade,
  type HeuristicAlert,
} from '@/lib/heuristics';

// ─────────────────────────────────────────────────────────
//  Helpers visuais
// ─────────────────────────────────────────────────────────

function heatmapColor(nivel: string) {
  if (nivel === 'sobrecarga') return 'bg-[var(--p0-soft)] text-[var(--p0)] font-semibold';
  if (nivel === 'pressao') return 'bg-[var(--p1-soft)] text-[var(--warn)] font-semibold';
  if (nivel === 'ok') return 'bg-[var(--brand-tint)] text-[var(--brand-dark)]';
  return 'bg-[var(--surface-3)] text-[var(--muted)]';
}

function budgetColor(pct: number) {
  if (pct > 110) return 'bg-[var(--danger)]';
  if (pct >= 90) return 'bg-[var(--warn)]';
  return 'bg-[var(--brand)]';
}

function budgetBg(pct: number) {
  if (pct > 110) return 'bg-[var(--p0-soft)]';
  if (pct >= 90) return 'bg-[var(--p1-soft)]';
  return 'bg-[var(--brand-soft)]';
}

function severityColor(s: string) {
  if (s === 'alta') return 'text-[var(--danger)] bg-[var(--p0-soft)] border-[var(--p0)]';
  if (s === 'media') return 'text-[var(--warn)] bg-[var(--p1-soft)] border-[var(--p1)]';
  return 'text-[var(--muted)] bg-[var(--surface-3)] border-[var(--line)]';
}

function clienteHref(clienteId: string) {
  return `/backlog?cliente=${clienteId}`;
}

function projetoHref(clienteId: string, projetoId: string) {
  return `/backlog?cliente=${clienteId}&projeto=${projetoId}`;
}

// ─────────────────────────────────────────────────────────
//  Header colapsável (blocos 3-8)
// ─────────────────────────────────────────────────────────

function SectionHeader({
  title,
  collapsed,
  onToggle,
  right,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="px-3 md:px-4 py-3 border-b border-line flex items-center justify-between gap-2 cursor-pointer select-none hover:bg-[var(--surface-3)] transition-colors"
      onClick={onToggle}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-muted text-[10px] shrink-0">{collapsed ? '▸' : '▾'}</span>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  KPI card (velocidade)
// ─────────────────────────────────────────────────────────

function VelCard({
  label, value, sub, meta, status, delta, deltaSign,
}: {
  label: string; value: string; sub: string; meta: string;
  status: 'ok' | 'warn' | 'danger' | 'muted';
  delta?: string; deltaSign?: 'up' | 'down' | 'neutral';
}) {
  const valueColor =
    status === 'ok' ? 'text-[var(--brand-dark)]' :
    status === 'warn' ? 'text-[var(--warn)]' :
    status === 'danger' ? 'text-[var(--danger)]' :
    'text-[var(--ink)]';
  const dotColor =
    status === 'ok' ? 'bg-[var(--brand)]' :
    status === 'warn' ? 'bg-[var(--warn)]' :
    status === 'danger' ? 'bg-[var(--danger)]' :
    'bg-[var(--line-strong)]';
  return (
    <div className="bg-elev border border-line rounded-xl p-3 md:p-4 flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted leading-none">{label}</div>
        <span className={cn('w-2 h-2 rounded-full shrink-0', dotColor)} />
      </div>
      <div className={cn('text-2xl md:text-3xl font-semibold tabular-nums leading-none mt-1', valueColor)}>{value}</div>
      {delta && (
        <div className={cn('text-[11px] mt-0.5',
          deltaSign === 'up' ? 'text-[var(--brand)]' :
          deltaSign === 'down' ? 'text-[var(--danger)]' : 'text-muted')}>
          {deltaSign === 'up' ? '▲' : deltaSign === 'down' ? '▼' : '●'} {delta}
        </div>
      )}
      <div className="text-[10px] text-muted mt-0.5">{meta}</div>
      <div className="text-[10px] text-muted hidden md:block">{sub}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  Alerta row — sempre exibe detalhe
// ─────────────────────────────────────────────────────────

function AlertRow({ alert }: { alert: HeuristicAlert }) {
  return (
    <div className={cn('border rounded-lg px-3 py-2 text-sm', severityColor(alert.severity))}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-xs font-bold mt-0.5 opacity-60">
          {alert.severity === 'alta' ? '●' : '○'}
        </span>
        <div className="min-w-0">
          <div className="font-medium leading-snug text-[13px]">{alert.titulo}</div>
          {alert.detalhe && (
            <div className="text-xs opacity-75 mt-1 leading-snug">{alert.detalhe}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  Briefing principal
// ─────────────────────────────────────────────────────────

const WEEK_LABELS_SHORT = ['Agora', '+1s', '+2s', '+3s'];
const WEEK_LABELS_LONG = ['Esta sem.', 'Próx. sem.', 'Em 2 sem.', 'Em 3 sem.'];

export function BriefingClient() {
  const { tasks, clientes, projetos, pessoas, loading, refreshing } = useData();
  const { openEdit } = useTaskModal();

  // Alertas: expand/collapse after 6
  const [alertsExpanded, setAlertsExpanded] = useState(false);

  // Seções colapsáveis (blocos 3-8) — expandidas por padrão
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const baseTasks = useMemo(() => tasks.filter((t) => !t.arquivadoEm), [tasks]);

  const vel = useMemo(() => computeVelocidade(baseTasks), [baseTasks]);

  const heuristicAlerts = useMemo(
    () => computeHeuristicAlerts(baseTasks, clientes, projetos, pessoas),
    [baseTasks, clientes, projetos, pessoas],
  );
  const countAlta = heuristicAlerts.filter((a) => a.severity === 'alta').length;
  const countMedia = heuristicAlerts.filter((a) => a.severity === 'media').length;
  const alertsVisible = alertsExpanded ? heuristicAlerts : heuristicAlerts.slice(0, 6);

  const projetosSaude = useMemo(
    () => computeProjetosSaude(baseTasks, projetos, clientes),
    [baseTasks, projetos, clientes],
  );

  const wca = useMemo(
    () => computeWeeklyCapacityAnalysis(baseTasks, clientes, projetos, pessoas),
    [baseTasks, clientes, projetos, pessoas],
  );

  const clientesById = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);

  // Clientes em atenção
  const clientesAtencao = useMemo(() => {
    type Entry = {
      nomeCliente: string; tier: string; sinalMax: 'vermelho' | 'amarelo';
      nAtrasadas: number; orcPct: number | null; nTasks: number; hTotal: number;
    };
    const cliMap = new Map<string, Entry>();
    for (const ps of projetosSaude) {
      if (ps.sinal === 'verde') continue;
      const existing = cliMap.get(ps.clienteId);
      const sinalMax: 'vermelho' | 'amarelo' =
        ps.sinal === 'vermelho' ? 'vermelho' : existing?.sinalMax === 'vermelho' ? 'vermelho' : 'amarelo';
      if (existing) { existing.sinalMax = sinalMax; }
      else {
        cliMap.set(ps.clienteId, {
          nomeCliente: ps.nomeCliente, tier: clientesById.get(ps.clienteId)?.tier ?? '',
          sinalMax, nAtrasadas: 0, orcPct: null, nTasks: 0, hTotal: 0,
        });
      }
    }
    for (const t of baseTasks) {
      if (t.status === 'concluido') continue;
      const entry = cliMap.get(t.clienteId);
      if (!entry) continue;
      entry.nTasks++;
      entry.hTotal += t.esforco ?? 0;
      if (atrasada(t)) entry.nAtrasadas++;
    }
    for (const pf of wca.projetosFechados) {
      const entry = cliMap.get(pf.clienteId);
      if (!entry) continue;
      if (entry.orcPct === null || pf.pctEsgotamento > entry.orcPct) entry.orcPct = pf.pctEsgotamento;
    }
    for (const s of wca.sustentacoes) {
      const entry = cliMap.get(s.clienteId);
      if (!entry) continue;
      const maxPct = Math.max(...s.weeks.map((w) => w.pctCap ?? 0));
      if (s.estourando && (entry.orcPct === null || maxPct > entry.orcPct)) entry.orcPct = maxPct;
    }
    return Array.from(cliMap.entries())
      .map(([clienteId, v]) => ({ clienteId, ...v }))
      .sort((a, b) => (a.sinalMax === 'vermelho' ? -1 : b.sinalMax === 'vermelho' ? 1 : 0));
  }, [projetosSaude, baseTasks, clientesById, wca]);

  function ctaText(c: (typeof clientesAtencao)[number]) {
    if (c.orcPct !== null && c.orcPct > 110) return 'Renegociar escopo ou cobrar adicional';
    if (c.nAtrasadas > 0) return 'Conversar hoje sobre prazo';
    return 'Avaliar situação com o time';
  }

  // Redistribuição
  const redistSugestoes = useMemo(() => {
    type Sugestao = {
      pessoaNome: string; semLabel: string; targetNome: string | null;
      tasks: Array<{ id: string; titulo: string; esforco: number }>;
    };
    const out: Sugestao[] = [];
    for (const p of wca.pessoas) {
      const overIdx = p.weeks.findIndex((w) => w.nivel === 'sobrecarga' || w.nivel === 'pressao');
      if (overIdx < 0) continue;
      const folga = wca.pessoas.find(
        (other) => other.pessoaId !== p.pessoaId && other.weeks[overIdx].nivel === 'folga',
      );
      const semLabel = overIdx === 0 ? 'esta semana' : overIdx === 1 ? 'próxima semana' : `em ${overIdx} semanas`;
      const personTasks = baseTasks
        .filter((t) => t.pessoaId === p.pessoaId && t.status !== 'concluido')
        .sort((a, b) => (b.esforco ?? 0) - (a.esforco ?? 0))
        .slice(0, 3)
        .map((t) => ({ id: t.id, titulo: t.titulo, esforco: t.esforco ?? 0 }));
      if (personTasks.length > 0) {
        out.push({ pessoaNome: p.nome.split(' ')[0], semLabel, targetNome: folga ? folga.nome.split(' ')[0] : null, tasks: personTasks });
      }
      if (out.length >= 5) break;
    }
    return out;
  }, [wca, baseTasks]);

  // Disciplina operacional — dois grupos
  const disciplinaGroups = useMemo(() => {
    const now = Date.now();
    const h24ago = now - 24 * 3600000;
    const pessoasById = new Map(pessoas.map((p) => [p.id, p]));
    type Issue = { id: string; titulo: string; motivo: string; pessoaNome: string; diasSem: number };
    const andamento: Issue[] = [];
    const bloqueados: Issue[] = [];

    for (const t of baseTasks) {
      if (t.status === 'concluido' || t.status === 'backlog') continue;
      const lastUpdate = Math.max(t.statusEm ?? 0, t.subetapaEm ?? 0);
      const pessoaNome = pessoasById.get(t.pessoaId)?.nome?.split(' ')[0] ?? '—';
      const diasSem = Math.floor((now - lastUpdate) / 86400000);

      if (t.status === 'bloqueado' && !t.bloqueadoPor) {
        bloqueados.push({ id: t.id, titulo: t.titulo, motivo: 'sem motivo de bloqueio', pessoaNome, diasSem });
      } else if (t.status === 'andamento' && lastUpdate < h24ago) {
        andamento.push({ id: t.id, titulo: t.titulo, motivo: `sem atualização há ${diasSem === 0 ? '<1' : diasSem}d`, pessoaNome, diasSem });
      }
    }

    andamento.sort((a, b) => b.diasSem - a.diasSem);
    bloqueados.sort((a, b) => b.diasSem - a.diasSem);
    return { andamento: andamento.slice(0, 10), bloqueados: bloqueados.slice(0, 10) };
  }, [baseTasks, pessoas]);

  const disciplinaTotal = disciplinaGroups.andamento.length + disciplinaGroups.bloqueados.length;

  if (loading) {
    return <div className="text-muted text-sm py-8">Carregando…</div>;
  }

  // Data do dia · pt-BR · "terça, 2 de jun"
  const todayLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).replace('.', '').replace('-feira', '');

  return (
    <div>
      {/* ============ MOBILE · espelha mobile.jsx MBriefing ============ */}
      <div className="md:hidden">
        <BriefingMobile
          alerts={heuristicAlerts}
          countAlta={countAlta}
          countMedia={countMedia}
          todayLabel={todayLabel}
        />
      </div>

      {/* ============ DESKTOP · conteúdo original ============ */}
      <div className="hidden md:block">
      {/* ── PageHeader (DS) — bare div: pageheader.margin-bottom: 24px controla o Y do primeiro elemento abaixo ── */}
      <div className="hidden md:block">
        <PageHeader
          title="Briefing"
          context={<>{todayLabel}</>}
          right={
            <button
              type="button"
              onClick={() => window.print()}
              className="iconbtn bordered text-xs px-3"
              style={{ width: 'auto', gap: 6 }}
              title="Exportar PDF (impressão do navegador)"
            >
              <Icon name="download" size={14} />
              Exportar PDF
            </button>
          }
        />
      </div>

      <div className="space-y-4 md:space-y-6">
      {/* ── Bloco 1 · Velocidade da operação (não colapsável) ── */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden">
        <div className="px-3 md:px-4 py-3 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Velocidade da operação</h2>
          <span className="text-[10px] text-muted">throughput · lead · ciclo · previsibilidade · 30d</span>
        </div>
        <div className="p-3 md:p-4 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          <VelCard
            label="Throughput W-1" value={String(vel.throughputW1)} meta="meta ≥ 8/sem"
            sub="tasks concluídas na semana anterior"
            status={vel.throughputW1 >= 8 ? 'ok' : vel.throughputW1 >= 4 ? 'warn' : 'danger'}
            delta={vel.throughputW1 !== vel.throughputW2
              ? `${vel.throughputW1 > vel.throughputW2 ? '+' : ''}${vel.throughputW1 - vel.throughputW2} vs sem ant`
              : 'igual à sem ant'}
            deltaSign={vel.throughputW1 > vel.throughputW2 ? 'up' : vel.throughputW1 < vel.throughputW2 ? 'down' : 'neutral'}
          />
          <VelCard
            label="Lead time" value={vel.leadTimeDias != null ? `${vel.leadTimeDias}d` : '—'}
            meta="meta ≤ 7d" sub="criação → concluído · 30d"
            status={vel.leadTimeDias == null ? 'muted' : vel.leadTimeDias <= 7 ? 'ok' : vel.leadTimeDias <= 14 ? 'warn' : 'danger'}
          />
          <VelCard
            label="Ciclo" value={vel.cycleDias != null ? `${vel.cycleDias}d` : '—'}
            meta="meta ≤ 5d" sub="andamento → concluído · 30d"
            status={vel.cycleDias == null ? 'muted' : vel.cycleDias <= 5 ? 'ok' : vel.cycleDias <= 10 ? 'warn' : 'danger'}
          />
          <VelCard
            label="% no prazo" value={vel.pctNoPrazo != null ? `${vel.pctNoPrazo}%` : '—'}
            meta="meta ≥ 80%"
            sub={vel.pctNoPrazoBases > 0
              ? `${vel.pctNoPrazoOk}/${vel.pctNoPrazoBases} entregas com prazo · 30d`
              : 'sem entregas com prazo em 30d'}
            status={vel.pctNoPrazo == null ? 'muted' : vel.pctNoPrazo >= 80 ? 'ok' : vel.pctNoPrazo >= 50 ? 'warn' : 'danger'}
          />
        </div>
        {vel.pctNoPrazo != null && vel.pctNoPrazo < 80 && (
          <div className="px-3 md:px-4 pb-3 text-xs text-[var(--danger)]">
            {vel.pctNoPrazo < 50
              ? `${vel.pctNoPrazo}% de entregas no prazo — abaixo do crítico (meta ≥ 80%). Investigar gargalo.`
              : `${vel.pctNoPrazo}% de entregas no prazo — abaixo da meta. Revisar prazos ou capacidade.`}
          </div>
        )}
      </div>

      {/* ── Bloco 2 · Alertas (não colapsável, mas ver todos expansível) ── */}
      <div className="bg-elev border border-line rounded-xl p-3 md:p-4">
        <div className="flex items-center gap-2 mb-3">
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
          {heuristicAlerts.length > 6 && (
            <button
              onClick={() => setAlertsExpanded((v) => !v)}
              className="text-xs text-muted hover:text-ink ml-auto"
            >
              {alertsExpanded ? '▴ menos' : `▾ ver todos (${heuristicAlerts.length})`}
            </button>
          )}
        </div>
        {alertsVisible.length === 0 ? (
          <div className="text-sm text-muted">✓ Nenhum alerta no momento</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {alertsVisible.map((a, i) => <AlertRow key={i} alert={a} />)}
          </div>
        )}
      </div>

      {/* ── Bloco 3 · Clientes em atenção ── */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden">
        <SectionHeader
          title="Clientes em atenção"
          collapsed={collapsed.has('clientes')}
          onToggle={() => toggle('clientes')}
          right={
            <span className="text-xs text-muted">
              {clientesAtencao.length === 0 ? 'Todos saudáveis ✓' : `${clientesAtencao.length} cliente(s)`}
            </span>
          }
        />
        {!collapsed.has('clientes') && (
          clientesAtencao.length === 0 ? (
            <div className="px-4 py-5 text-sm text-[var(--brand)]">
              ✓ Nenhum cliente com projetos em alerta neste momento.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {clientesAtencao.map((c) => (
                <div key={c.clienteId} className="px-3 md:px-4 py-3 flex items-start gap-3">
                  <span className={cn('shrink-0 mt-1 w-2.5 h-2.5 rounded-full',
                    c.sinalMax === 'vermelho' ? 'bg-[var(--danger)]' : 'bg-[var(--warn)]')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <a href={clienteHref(c.clienteId)}
                        className="text-sm font-semibold text-ink hover:text-[var(--brand-dark)] hover:underline">
                        {c.nomeCliente}
                      </a>
                      {c.tier && (
                        <span className="text-[10px] text-muted border border-line rounded px-1 py-0.5">{c.tier}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {c.nAtrasadas > 0 && (
                        <span className="text-[var(--danger)] font-medium">
                          {c.nAtrasadas} task{c.nAtrasadas > 1 ? 's' : ''} atrasada{c.nAtrasadas > 1 ? 's' : ''}
                        </span>
                      )}
                      {c.orcPct != null && c.orcPct > 90 && (
                        <span className={cn(c.orcPct > 110 ? 'text-[var(--danger)] font-medium' : 'text-[var(--warn)] font-medium')}>
                          {c.nAtrasadas > 0 ? ' · ' : ''}orçamento de horas estourado ({c.orcPct}%)
                        </span>
                      )}
                    </div>
                    <div className="text-xs mt-1">
                      <span className="text-[var(--brand-dark)]">→ {ctaText(c)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-muted leading-tight">
                    <div className="font-mono">{c.nTasks} tasks</div>
                    <div className="font-mono">{c.hTotal}h</div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Bloco 4 · Capacidade semanal sustentação ── */}
      {wca.sustentacoes.length > 0 && (
        <div className="bg-elev border border-line rounded-xl overflow-hidden">
          <SectionHeader
            title="Capacidade semanal · sustentação"
            collapsed={collapsed.has('sust')}
            onToggle={() => toggle('sust')}
            right={
              <div className="flex items-center gap-2 text-[10px] text-muted">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-[var(--p0-soft)] inline-block" />
                  <span className="hidden sm:inline">Estouro</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-[var(--p1-soft)] inline-block" />
                  <span className="hidden sm:inline">Pressão</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-[var(--surface-3)] inline-block" />
                  <span className="hidden sm:inline">Ocioso</span>
                </span>
              </div>
            }
          />
          {!collapsed.has('sust') && (
            <div className="overflow-x-auto">
              <div className="px-3 md:px-4 py-3" style={{ minWidth: 360 }}>
                <div className="grid gap-1 mb-1.5" style={{ gridTemplateColumns: '150px repeat(4, 1fr) 60px' }}>
                  <div />
                  {WEEK_LABELS_SHORT.map((l, i) => (
                    <div key={l} className="text-center text-[10px] text-muted font-medium uppercase tracking-wide">
                      <span className="md:hidden">{l}</span>
                      <span className="hidden md:inline">{WEEK_LABELS_LONG[i]}</span>
                    </div>
                  ))}
                  <div className="text-center text-[10px] text-muted font-medium uppercase tracking-wide hidden md:block">Meta/sem</div>
                </div>
                <div className="space-y-1">
                  {wca.sustentacoes.map((s) => {
                    const cliNome = clientesById.get(s.clienteId)?.nome ?? '—';
                    return (
                      <div key={s.projetoId} className="grid gap-1 items-center" style={{ gridTemplateColumns: '150px repeat(4, 1fr) 60px' }}>
                        <div className="text-xs truncate pr-1">
                          <a href={projetoHref(s.clienteId, s.projetoId)} className="hover:underline" title={`${cliNome} · ${s.nome}`}>
                            <span className="text-muted">{cliNome}</span>
                            <span className="text-muted mx-0.5">·</span>
                            <span className="text-ink">{s.nome}</span>
                          </a>
                        </div>
                        {s.weeks.map((wk, i) => (
                          <div key={i} className={cn('text-center text-[11px] py-1.5 rounded font-mono', heatmapColor(wk.nivel))}
                            title={`${wk.hours}h / ${s.capSemanal}h`}>
                            {wk.pctCap != null ? `${wk.pctCap}%` : '—'}
                          </div>
                        ))}
                        <div className="text-center text-[10px] text-muted font-mono hidden md:block">{s.capSemanal}h</div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted mt-2">Meta semanal = orçamento mensal ÷ 4</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bloco 5 · Orçamento projetos fechados ── */}
      {wca.projetosFechados.length > 0 && (
        <div className="bg-elev border border-line rounded-xl overflow-hidden">
          <SectionHeader
            title="Orçamento · projetos fechados"
            collapsed={collapsed.has('proj')}
            onToggle={() => toggle('proj')}
          />
          {!collapsed.has('proj') && (
            <div className="divide-y divide-line">
              {wca.projetosFechados.map((p) => {
                const cliNome = clientesById.get(p.clienteId)?.nome ?? '—';
                return (
                  <div key={p.projetoId} className="px-3 md:px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <a href={projetoHref(p.clienteId, p.projetoId)}
                        className="text-sm font-medium text-ink hover:text-[var(--brand-dark)] hover:underline truncate">
                        <span className="text-muted font-normal">{cliNome}</span>
                        <span className="text-muted mx-0.5">·</span>
                        {p.nome}
                      </a>
                      <span className={cn('text-xs font-bold tabular-nums shrink-0 ml-2',
                        p.estourado ? 'text-[var(--danger)]' : p.risco ? 'text-[var(--warn)]' : 'text-muted')}>
                        {p.pctEsgotamento}%
                      </span>
                    </div>
                    <div className={cn('w-full h-2 rounded-full', budgetBg(p.pctEsgotamento))}>
                      <div className={cn('h-2 rounded-full', budgetColor(p.pctEsgotamento))}
                        style={{ width: `${Math.min(p.pctEsgotamento, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted mt-1">
                      <span>{p.usado}h usadas · {p.comprometido}h comprometidas</span>
                      <span className="shrink-0 ml-2">{p.orcTotal}h total</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Bloco 6 · Capacidade do time ── */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden">
        <SectionHeader
          title="Capacidade do time"
          collapsed={collapsed.has('time')}
          onToggle={() => toggle('time')}
          right={
            <div className="flex items-center gap-2 text-[10px] text-muted">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-[var(--p0-soft)] inline-block" />
                <span className="hidden sm:inline">Sobrecarga</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-[var(--p1-soft)] inline-block" />
                <span className="hidden sm:inline">Pressão</span>
              </span>
            </div>
          }
        />
        {!collapsed.has('time') && (
          wca.pessoas.length === 0 ? (
            <div className="px-4 py-5 text-sm text-muted">Nenhum dado de capacidade</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="px-3 md:px-4 py-3" style={{ minWidth: 300 }}>
                <div className="grid gap-1 mb-1.5" style={{ gridTemplateColumns: '72px repeat(4, 1fr)' }}>
                  <div />
                  {WEEK_LABELS_SHORT.map((l, i) => (
                    <div key={l} className="text-center text-[10px] text-muted font-medium uppercase tracking-wide">
                      <span className="md:hidden">{l}</span>
                      <span className="hidden md:inline">{WEEK_LABELS_LONG[i]}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  {wca.pessoas.map((p) => (
                    <div key={p.pessoaId} className="grid gap-1 items-center" style={{ gridTemplateColumns: '72px repeat(4, 1fr)' }}>
                      <div className="text-xs text-ink truncate pr-1" title={p.nome}>{p.nome.split(' ')[0]}</div>
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
            </div>
          )
        )}
      </div>

      {/* ── Bloco 7 · Redistribuição por heurística ── */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden">
        <SectionHeader
          title="Redistribuição por heurística"
          collapsed={collapsed.has('redist')}
          onToggle={() => toggle('redist')}
          right={<p className="text-[11px] text-muted">Sugestões automáticas — revisar antes de aplicar</p>}
        />
        {!collapsed.has('redist') && (
          redistSugestoes.length === 0 ? (
            <div className="px-4 py-5 text-sm text-[var(--brand)]">
              ✓ Capacidade equilibrada nas próximas 4 semanas.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {redistSugestoes.map((s, i) => (
                <div key={i} className="px-3 md:px-4 py-3">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-[var(--warn)] shrink-0 text-sm mt-0.5">⚠</span>
                    <span className="text-sm text-ink leading-snug">
                      <span className="font-medium">{s.pessoaNome}</span>{' '}em sobrecarga {s.semLabel}
                      {s.targetNome && (
                        <span className="text-muted"> — considerar <span className="font-medium text-ink">{s.targetNome}</span> (folga)</span>
                      )}
                    </span>
                  </div>
                  <div className="ml-5 space-y-0.5">
                    {s.tasks.map((t) => (
                      <button key={t.id} type="button" onClick={() => openEdit(t.id)}
                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--surface-3)] transition-colors group">
                        <span className="text-xs text-muted font-mono shrink-0 w-8 text-right">{t.esforco}h</span>
                        <span className="text-xs text-ink truncate group-hover:text-[var(--brand-dark)]">{t.titulo}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Bloco 8 · Disciplina operacional ── */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden">
        <SectionHeader
          title="Disciplina operacional"
          collapsed={collapsed.has('disciplina')}
          onToggle={() => toggle('disciplina')}
          right={
            disciplinaTotal > 0
              ? <span className="text-xs font-bold text-[var(--warn)]">{disciplinaTotal} issue{disciplinaTotal > 1 ? 's' : ''}</span>
              : undefined
          }
        />
        {!collapsed.has('disciplina') && (
          disciplinaTotal === 0 ? (
            <div className="px-4 py-5 text-sm text-[var(--brand)]">
              ✓ Todas as tasks ativas atualizadas nas últimas 24h · nenhum bloqueio sem motivo.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {/* Grupo 1: andamento sem atualização nas últimas 24h */}
              {disciplinaGroups.andamento.length > 0 && (
                <>
                  <div className="px-3 md:px-4 py-1.5 bg-[var(--surface-3)] text-[10px] font-medium uppercase tracking-wide text-muted">
                    Em andamento · sem atualização nas últimas 24h ({disciplinaGroups.andamento.length})
                  </div>
                  {disciplinaGroups.andamento.map((issue) => (
                    <button key={issue.id} type="button" onClick={() => openEdit(issue.id)}
                      className="w-full text-left px-3 md:px-4 py-2.5 flex items-start gap-3 hover:bg-[var(--surface-3)] transition-colors group">
                      <span className="shrink-0 mt-1.5 w-2 h-2 rounded-full bg-[var(--warn)]" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-ink truncate group-hover:text-[var(--brand-dark)]">{issue.titulo}</div>
                        <div className="text-xs text-muted mt-0.5">{issue.motivo}</div>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted">{issue.pessoaNome}</span>
                    </button>
                  ))}
                </>
              )}
              {/* Grupo 2: bloqueadas sem motivo */}
              {disciplinaGroups.bloqueados.length > 0 && (
                <>
                  <div className={cn(
                    'px-3 md:px-4 py-1.5 bg-[var(--surface-3)] text-[10px] font-medium uppercase tracking-wide text-muted',
                    disciplinaGroups.andamento.length > 0 && 'border-t border-line',
                  )}>
                    Bloqueadas sem motivo ({disciplinaGroups.bloqueados.length})
                  </div>
                  {disciplinaGroups.bloqueados.map((issue) => (
                    <button key={issue.id} type="button" onClick={() => openEdit(issue.id)}
                      className="w-full text-left px-3 md:px-4 py-2.5 flex items-start gap-3 hover:bg-[var(--surface-3)] transition-colors group">
                      <span className="shrink-0 mt-1.5 w-2 h-2 rounded-full bg-[var(--danger)]" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-ink truncate group-hover:text-[var(--brand-dark)]">{issue.titulo}</div>
                        <div className="text-xs text-muted mt-0.5">{issue.motivo}</div>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted">{issue.pessoaNome}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )
        )}
      </div>

      </div>
      </div>
    </div>
  );
}

// ============================================================
// MOBILE · espelha mobile.jsx MBriefing
// ============================================================
function BriefingMobile({
  alerts,
  countAlta,
  countMedia,
  todayLabel,
}: {
  alerts: HeuristicAlert[];
  countAlta: number;
  countMedia: number;
  todayLabel: string;
}) {
  const criticos = alerts.filter((a) => a.severity === 'alta').slice(0, 6);
  const atencao = alerts.filter((a) => a.severity === 'media').slice(0, 6);

  // Clientes em atenção: derivar de alerts associados a um clienteId (heurística)
  const clientesAtencao = useMemo(() => {
    const seen = new Map<string, { nm: string; sinal: string; lt: string; act: string; tag: string }>();
    for (const a of alerts) {
      const cid = (a as { clienteId?: string }).clienteId;
      const cnome = (a as { clienteNome?: string }).clienteNome;
      if (!cid || !cnome) continue;
      if (seen.has(cid)) continue;
      seen.set(cid, {
        nm: cnome,
        sinal: a.severity === 'alta' ? 'var(--danger)' : 'var(--warn)',
        lt: a.titulo,
        act: (a as { acao?: string }).acao || 'Revisar plano',
        tag: (a as { tag?: string }).tag || (a.severity === 'alta' ? 'crítico' : 'atenção'),
      });
      if (seen.size >= 4) break;
    }
    return Array.from(seen.values());
  }, [alerts]);

  return (
    <div className="m-scroll">
      <div className="m-pagetitle">
        <h1>Briefing</h1>
        <div className="narr">
          resumo operacional <span className="sep">·</span> <b>{todayLabel}</b>
        </div>
      </div>

      <div className="m-sec">
        <div className="b-seehead">
          <div className="t">
            <h3>Alertas</h3>
            <span className="b-counts">
              <span className="b-count crit">{countAlta} críticos</span>
              <span className="b-count att">{countMedia} atenção</span>
            </span>
          </div>
          <span className="b-link">ver todos ({alerts.length})</span>
        </div>
        <div className="b-alerts">
          {criticos.map((a, i) => (
            <div key={'c' + i} className="b-alert crit">
              <span className="dot" />
              <div>
                <div className="at">{a.titulo}</div>
                {a.detalhe && <div className="ad">{a.detalhe}</div>}
              </div>
            </div>
          ))}
          {atencao.map((a, i) => (
            <div key={'a' + i} className="b-alert att">
              <span className="dot" />
              <div>
                <div className="at">{a.titulo}</div>
                {a.detalhe && <div className="ad">{a.detalhe}</div>}
              </div>
            </div>
          ))}
          {criticos.length + atencao.length === 0 && (
            <div className="text-muted text-xs italic px-2 py-3">Nenhum alerta no momento.</div>
          )}
        </div>
      </div>

      {clientesAtencao.length > 0 && (
        <div className="m-sec mt14">
          <div className="b-seehead">
            <div className="t">
              <h3>Clientes em atenção</h3>
            </div>
            <span className="muted fs12 mono">{clientesAtencao.length} clientes</span>
          </div>
          <div>
            {clientesAtencao.map((c) => (
              <div key={c.nm} className="b-cli">
                <div className="top">
                  <span className="sd" style={{ background: c.sinal }} />
                  <span className="nm">{c.nm}</span>
                  <span className="chip" style={{ padding: '2px 8px' }}>{c.tag}</span>
                </div>
                <div className="lt">{c.lt}</div>
                <span className="act">
                  <span style={{ fontSize: 14 }}>→</span>
                  {c.act}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
