'use client';

import { useMemo, useState } from 'react';
import { useData } from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
import { PageHeader } from '@/components/page-header';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { atrasada, isPreTriagem } from '@/lib/task-utils';
import { SUB_LABELS } from '@/lib/task-constants';
import {
  computeWeeklyCapacityAnalysis,
  computeProjetosSaude,
  computeHeuristicAlerts,
  computeSkillMismatches,
  computeSenioridadeAlerts,
  computeChurnRisk,
  computeBottlenecks,
  computeSLABreach,
  computeN1Reaberturas,
  computeN2Aging,
  computeN3MixOfWork,
  computeN4EstimGap,
  computeN5VelocidadeIndividual,
  computeN6Concentracao,
  computeN7Bloqueios,
  computeN8TempoAprovacao,
  computeN9Privadas,
  computeN10CriterioCob,
  computeN11ValorEntregueCob,
  computeN12WIP,
  computeN13PrazoDesalinhado,
  computeN14SemResponsavel,
  computeN15SemProjeto,
  computeN16Stale,
  computeN17TriagemAtrasada,
  computeN18OrigemDemanda,
} from '@/lib/analytics';

// ─────────────────────────────────────────────────────────
//  Helpers visuais
// ─────────────────────────────────────────────────────────

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

function clienteHref(clienteId: string) {
  return `/backlog?cliente=${clienteId}`;
}

// ─────────────────────────────────────────────────────────
//  Card genérico de heurística (uniforme · sem design fancy)
// ─────────────────────────────────────────────────────────

function HCard({
  id, title, count, emptyMsg, collapsed, onToggle, severity, children,
}: {
  id: string;
  title: string;
  count: number;
  emptyMsg?: string;
  collapsed: boolean;
  onToggle: () => void;
  severity?: 'alta' | 'media' | 'baixa' | null;
  children?: React.ReactNode;
}) {
  const sevDot = severity === 'alta' ? 'bg-[var(--danger)]'
    : severity === 'media' ? 'bg-[var(--warn)]'
    : 'bg-[var(--brand)]';
  return (
    <div className="bg-elev border border-line rounded-xl overflow-hidden" data-h={id}>
      <SectionHeader
        title={title}
        collapsed={collapsed}
        onToggle={onToggle}
        right={
          <div className="flex items-center gap-2">
            {severity && <span className={cn('w-1.5 h-1.5 rounded-full', sevDot)} />}
            <span className="text-xs text-muted">{count === 0 ? 'ok ✓' : count}</span>
          </div>
        }
      />
      {!collapsed && (
        count === 0
          ? <div className="px-4 py-4 text-sm text-[var(--brand)]">{emptyMsg ?? '✓ nada a reportar'}</div>
          : <div className="divide-y divide-line">{children}</div>
      )}
    </div>
  );
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
//  Briefing principal
// ─────────────────────────────────────────────────────────

export function BriefingClient() {
  const { tasks, clientes, projetos, pessoas, loading, isCEO } = useData();
  const { openEdit } = useTaskModal();

  // Seções colapsáveis — expandidas por padrão
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // Pre-triagem (IA criada, sem triada_em) fica fora do Briefing — só
  // entra em alertas/clientes-em-atenção depois de aceita na Triagem.
  const baseTasks = useMemo(() => tasks.filter((t) => !t.arquivadoEm && !isPreTriagem(t)), [tasks]);

  const heuristicAlerts = useMemo(
    () => computeHeuristicAlerts(baseTasks, clientes, projetos, pessoas),
    [baseTasks, clientes, projetos, pessoas],
  );
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // ── Heurísticas N.1-N.18 ──
  const n1 = useMemo(() => computeN1Reaberturas(baseTasks), [baseTasks]);
  const n2 = useMemo(() => computeN2Aging(baseTasks), [baseTasks]);
  const n3 = useMemo(() => computeN3MixOfWork(baseTasks), [baseTasks]);
  const n4 = useMemo(() => computeN4EstimGap(baseTasks), [baseTasks]);
  const n5 = useMemo(() => computeN5VelocidadeIndividual(baseTasks), [baseTasks]);
  const n6 = useMemo(() => computeN6Concentracao(baseTasks), [baseTasks]);
  const n7 = useMemo(() => computeN7Bloqueios(baseTasks), [baseTasks]);
  const n8 = useMemo(() => computeN8TempoAprovacao(baseTasks), [baseTasks]);
  const n9 = useMemo(() => computeN9Privadas(baseTasks), [baseTasks]);
  const n10 = useMemo(() => computeN10CriterioCob(baseTasks), [baseTasks]);
  const n11 = useMemo(() => computeN11ValorEntregueCob(baseTasks), [baseTasks]);
  const n12 = useMemo(() => computeN12WIP(baseTasks), [baseTasks]);
  const n13 = useMemo(() => computeN13PrazoDesalinhado(baseTasks), [baseTasks]);
  const n14 = useMemo(() => computeN14SemResponsavel(baseTasks), [baseTasks]);
  const n15 = useMemo(() => computeN15SemProjeto(baseTasks), [baseTasks]);
  const n16 = useMemo(() => computeN16Stale(baseTasks), [baseTasks]);
  const n17 = useMemo(() => computeN17TriagemAtrasada(baseTasks), [baseTasks]);
  const n18 = useMemo(() => computeN18OrigemDemanda(baseTasks), [baseTasks]);

  const projetosSaude = useMemo(
    () => computeProjetosSaude(baseTasks, projetos, clientes),
    [baseTasks, projetos, clientes],
  );

  const wca = useMemo(
    () => computeWeeklyCapacityAnalysis(baseTasks, clientes, projetos, pessoas),
    [baseTasks, clientes, projetos, pessoas],
  );

  const clientesById = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const pessoasById = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);
  const projetosById = useMemo(() => new Map(projetos.map((p) => [p.id, p])), [projetos]);

  // ── Heurísticas C (publicadas em jul/2026) ──
  const skillMismatches = useMemo(
    () => computeSkillMismatches(baseTasks, pessoasById),
    [baseTasks, pessoasById],
  );
  const senioridadeAlerts = useMemo(
    () => computeSenioridadeAlerts(baseTasks, pessoasById),
    [baseTasks, pessoasById],
  );
  const churnRisk = useMemo(
    () => computeChurnRisk(baseTasks, clientes),
    [baseTasks, clientes],
  );
  const bottlenecks = useMemo(
    () => computeBottlenecks(baseTasks)
      .filter((b) => b.count > 0)
      .sort((a, b) => b.mediana - a.mediana),
    [baseTasks],
  );
  const slaBreach = useMemo(() => computeSLABreach(baseTasks), [baseTasks]);

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

      {/* ── Mobile · título compacto ── */}
      <div className="md:hidden">
        <div className="m-pagetitle">
          <h1>Briefing</h1>
          <div className="narr">
            resumo operacional<span className="sep">·</span><b>{todayLabel}</b>
          </div>
        </div>
      </div>

      <div className="space-y-4 md:space-y-6">
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

      {/* Bloco 4 (Capacidade sustentação) e Bloco 6 (Capacidade do time)
          foram movidos pro Dashboard em jul/2026 — Briefing fica focado
          em heurísticas e leitura editorial. */}

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

      {/* ── Heurísticas analytics (C.3-C.8) · publicadas em jul/2026 ──
           Renderização inicial simples · refinaremos UX/UI conforme uso real */}

      {/* C.5 · Churn risk por cliente */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden">
        <SectionHeader
          title="Risco de churn · clientes externos"
          collapsed={collapsed.has('churn')}
          onToggle={() => toggle('churn')}
          right={
            <span className="text-xs text-muted">
              {churnRisk.length === 0 ? 'Nenhum sinal ✓' : `${churnRisk.length} cliente(s)`}
            </span>
          }
        />
        {!collapsed.has('churn') && (
          churnRisk.length === 0 ? (
            <div className="px-4 py-5 text-sm text-[var(--brand)]">✓ Sem sinais de churn no momento.</div>
          ) : (
            <div className="divide-y divide-line">
              {churnRisk.map((c) => {
                const nome = clientesById.get(c.clienteId)?.nome ?? '—';
                const levelColor = c.level === 'critico' ? 'text-[var(--danger)] bg-[var(--p0-soft)]'
                  : c.level === 'atencao' ? 'text-[var(--warn)] bg-[var(--p1-soft)]'
                  : 'text-muted bg-[var(--surface-3)]';
                return (
                  <div key={c.clienteId} className="px-3 md:px-4 py-3 flex items-center gap-3">
                    <span className={cn('text-[11px] font-bold tabular-nums px-2 py-0.5 rounded', levelColor)}>
                      {c.score}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a href={`/backlog?cliente=${c.clienteId}`} className="text-sm font-medium text-ink hover:underline">{nome}</a>
                      <div className="text-[11px] text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        {c.sinais.tasksBloquadas14d > 0 && <span>{c.sinais.tasksBloquadas14d} bloqueada(s) &gt;14d</span>}
                        {c.sinais.diasSemEntrega !== null && c.sinais.diasSemEntrega > 30 && <span>{c.sinais.diasSemEntrega}d sem entrega</span>}
                        {c.sinais.slaBreachRate > 0.4 && <span>{Math.round(c.sinais.slaBreachRate * 100)}% SLA breach</span>}
                        {c.sinais.tasksEmDefinicao21d > 0 && <span>{c.sinais.tasksEmDefinicao21d} em definição &gt;21d</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* C.3 · Skill mismatch */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden">
        <SectionHeader
          title="Skill mismatch · pessoa sem skill da task"
          collapsed={collapsed.has('skill')}
          onToggle={() => toggle('skill')}
          right={
            <span className="text-xs text-muted">
              {skillMismatches.length === 0 ? 'Todas alinhadas ✓' : `${skillMismatches.length} task(s)`}
            </span>
          }
        />
        {!collapsed.has('skill') && (
          skillMismatches.length === 0 ? (
            <div className="px-4 py-5 text-sm text-[var(--brand)]">✓ Todas as tasks com escopo têm responsáveis compatíveis.</div>
          ) : (
            <div className="divide-y divide-line">
              {skillMismatches.map((m) => {
                const pessoa = pessoasById.get(m.pessoaId)?.nome ?? '—';
                const cli = clientesById.get(m.clienteId)?.nome ?? '—';
                return (
                  <button key={m.taskId} type="button" onClick={() => openEdit(m.taskId)}
                    className="w-full text-left px-3 md:px-4 py-2.5 hover:bg-[var(--surface-3)] transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-ink truncate">{m.taskTitulo}</div>
                        <div className="text-[11px] text-muted mt-0.5">{cli} · {pessoa}</div>
                      </div>
                      <div className="flex flex-wrap gap-1 shrink-0">
                        {m.missingSkills.slice(0, 4).map((s) => (
                          <span key={s} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--p1-soft)] text-[var(--warn)]">
                            {s}
                          </span>
                        ))}
                        {m.missingSkills.length > 4 && (
                          <span className="text-[10px] text-muted">+{m.missingSkills.length - 4}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* C.4 · Senioridade malalocada */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden">
        <SectionHeader
          title="Senioridade malalocada"
          collapsed={collapsed.has('senior')}
          onToggle={() => toggle('senior')}
          right={
            <span className="text-xs text-muted">
              {senioridadeAlerts.length === 0 ? 'Bem distribuído ✓' : `${senioridadeAlerts.length} caso(s)`}
            </span>
          }
        />
        {!collapsed.has('senior') && (
          senioridadeAlerts.length === 0 ? (
            <div className="px-4 py-5 text-sm text-[var(--brand)]">✓ Senioridade vs complexidade balanceada.</div>
          ) : (
            <div className="divide-y divide-line">
              {senioridadeAlerts.map((a) => {
                const pessoa = pessoasById.get(a.pessoaId)?.nome ?? '—';
                const cli = clientesById.get(a.clienteId)?.nome ?? '—';
                const isRisco = a.type === 'risco_qualidade';
                return (
                  <button key={a.taskId} type="button" onClick={() => openEdit(a.taskId)}
                    className="w-full text-left px-3 md:px-4 py-2.5 hover:bg-[var(--surface-3)] transition-colors">
                    <div className="flex items-start gap-3">
                      <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0',
                        isRisco ? 'bg-[var(--p0-soft)] text-[var(--danger)]' : 'bg-[var(--surface-3)] text-muted')}>
                        {isRisco ? 'Risco' : 'Desperdício'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-ink truncate">{a.taskTitulo}</div>
                        <div className="text-[11px] text-muted mt-0.5">
                          {cli} · {pessoa} ({a.senioridade}) · complexidade {a.complexidade}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* C.7 · Bottleneck por sub-etapa */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden">
        <SectionHeader
          title="Bottlenecks · tempo médio por sub-etapa"
          collapsed={collapsed.has('bottle')}
          onToggle={() => toggle('bottle')}
          right={<span className="text-xs text-muted">dias na sub-etapa atual</span>}
        />
        {!collapsed.has('bottle') && (
          bottlenecks.length === 0 ? (
            <div className="px-4 py-5 text-sm text-muted">Nenhuma task aberta com timestamp de subetapa.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] text-muted uppercase tracking-wide">
                  <tr className="border-b border-line">
                    <th className="text-left px-3 md:px-4 py-2 font-medium">Sub-etapa</th>
                    <th className="text-right px-3 py-2 font-medium">N</th>
                    <th className="text-right px-3 py-2 font-medium">Mediana</th>
                    <th className="text-right px-3 py-2 font-medium">P75</th>
                    <th className="text-right px-3 md:px-4 py-2 font-medium">P90</th>
                  </tr>
                </thead>
                <tbody>
                  {bottlenecks.map((b) => (
                    <tr key={b.subetapa} className="border-b border-line last:border-0">
                      <td className="px-3 md:px-4 py-2 text-ink">{SUB_LABELS[b.subetapa] ?? b.subetapa}</td>
                      <td className="text-right px-3 py-2 font-mono text-muted">{b.count}</td>
                      <td className="text-right px-3 py-2 font-mono">{b.mediana}d</td>
                      <td className="text-right px-3 py-2 font-mono text-muted">{b.p75}d</td>
                      <td className="text-right px-3 md:px-4 py-2 font-mono text-muted">{b.p90}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* C.8 · SLA breach por cliente */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden">
        <SectionHeader
          title="SLA breach · % de tasks concluídas fora do prazo"
          collapsed={collapsed.has('sla')}
          onToggle={() => toggle('sla')}
          right={
            slaBreach.overall.total > 0 ? (
              <span className="text-xs text-muted">
                Geral: {Math.round(slaBreach.overall.rate * 100)}% ({slaBreach.overall.breached}/{slaBreach.overall.total})
              </span>
            ) : <span className="text-xs text-muted">Sem dados</span>
          }
        />
        {!collapsed.has('sla') && slaBreach.overall.total > 0 && (() => {
          const rows = [...slaBreach.byCliente.entries()]
            .map(([clienteId, stats]) => ({ clienteId, ...stats }))
            .filter((r) => r.total >= 3)
            .sort((a, b) => b.rate - a.rate)
            .slice(0, 10);
          return rows.length === 0 ? (
            <div className="px-4 py-5 text-sm text-muted">Sem clientes com ≥ 3 entregas concluídas.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] text-muted uppercase tracking-wide">
                  <tr className="border-b border-line">
                    <th className="text-left px-3 md:px-4 py-2 font-medium">Cliente</th>
                    <th className="text-right px-3 py-2 font-medium">Concluídas</th>
                    <th className="text-right px-3 py-2 font-medium">Fora do prazo</th>
                    <th className="text-right px-3 md:px-4 py-2 font-medium">% breach</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const nome = clientesById.get(r.clienteId)?.nome ?? '—';
                    const pct = Math.round(r.rate * 100);
                    const color = pct >= 50 ? 'text-[var(--danger)]' : pct >= 20 ? 'text-[var(--warn)]' : 'text-muted';
                    return (
                      <tr key={r.clienteId} className="border-b border-line last:border-0">
                        <td className="px-3 md:px-4 py-2 text-ink">
                          <a href={`/backlog?cliente=${r.clienteId}`} className="hover:underline">{nome}</a>
                        </td>
                        <td className="text-right px-3 py-2 font-mono text-muted">{r.total}</td>
                        <td className="text-right px-3 py-2 font-mono text-muted">{r.breached}</td>
                        <td className={cn('text-right px-3 md:px-4 py-2 font-mono font-semibold', color)}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          H1-H15 · Cards individuais a partir de computeHeuristicAlerts
          (cada alert vira um card · severidade preservada)
          ═══════════════════════════════════════════════════════════ */}
      {heuristicAlerts.map((a, idx) => {
        const id = `h-${a.kind}-${a.weekIdx ?? idx}`;
        const ids = a.taskIds ?? [];
        return (
          <HCard
            key={id} id={id} title={a.titulo}
            count={ids.length || 1}
            severity={a.severity}
            collapsed={collapsed.has(id)}
            onToggle={() => toggle(id)}
          >
            {a.detalhe && (
              <div className="px-3 md:px-4 py-2 text-xs text-muted">{a.detalhe}</div>
            )}
            {ids.slice(0, 20).map((tid) => {
              const t = tasksById.get(tid);
              if (!t) return null;
              const cli = clientesById.get(t.clienteId)?.nome ?? '—';
              const pes = pessoasById.get(t.pessoaId)?.nome.split(' ')[0] ?? '—';
              return (
                <button key={tid} type="button" onClick={() => openEdit(tid)}
                  className="w-full text-left px-3 md:px-4 py-2 flex items-center gap-3 hover:bg-[var(--surface-3)] transition-colors">
                  <span className="text-sm text-ink truncate flex-1">{t.titulo}</span>
                  <span className="text-[11px] text-muted shrink-0">{cli} · {pes}</span>
                </button>
              );
            })}
            {ids.length > 20 && (
              <div className="px-3 md:px-4 py-2 text-[11px] text-muted">+{ids.length - 20} task(s)</div>
            )}
          </HCard>
        );
      })}

      {/* ═══════════════════════════════════════════════════════════
          N.1-N.18 · novas heurísticas (jun/2026)
          Renderização inicial enxuta · refinaremos UX ao vivo
          ═══════════════════════════════════════════════════════════ */}

      {/* N.1 · Reaberturas crônicas (≥ 2x) */}
      <HCard id="n1" title="N.1 · Reaberturas crônicas (≥ 2x)" count={n1.length}
        collapsed={collapsed.has('n1')} onToggle={() => toggle('n1')}>
        {n1.slice(0, 30).map((x) => (
          <button key={x.taskId} type="button" onClick={() => openEdit(x.taskId)}
            className="w-full text-left px-3 md:px-4 py-2 flex items-center gap-3 hover:bg-[var(--surface-3)]">
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--p1-soft)] text-[var(--warn)] shrink-0">{x.reopenCount}x</span>
            <span className="text-sm text-ink truncate flex-1">{x.titulo}</span>
            <span className="text-[11px] text-muted shrink-0">{clientesById.get(x.clienteId)?.nome ?? '—'}</span>
          </button>
        ))}
      </HCard>

      {/* N.2 · Aging em backlog (>30d) */}
      <HCard id="n2" title="N.2 · Aging em backlog (>30 dias)" count={n2.length}
        collapsed={collapsed.has('n2')} onToggle={() => toggle('n2')}>
        {n2.slice(0, 30).map((x) => (
          <button key={x.taskId} type="button" onClick={() => openEdit(x.taskId)}
            className="w-full text-left px-3 md:px-4 py-2 flex items-center gap-3 hover:bg-[var(--surface-3)]">
            <span className="text-[11px] font-mono text-muted shrink-0 w-12 text-right">{x.diasParado}d</span>
            <span className="text-sm text-ink truncate flex-1">{x.titulo}</span>
            <span className="text-[11px] text-muted shrink-0">{clientesById.get(x.clienteId)?.nome ?? '—'}</span>
          </button>
        ))}
      </HCard>

      {/* N.3 · Mix-of-work por cliente */}
      <HCard id="n3" title="N.3 · Mix-of-work por cliente (tipo de trabalho)" count={n3.length}
        collapsed={collapsed.has('n3')} onToggle={() => toggle('n3')}>
        {n3.slice(0, 20).map((r) => {
          const nome = clientesById.get(r.clienteId)?.nome ?? '—';
          return (
            <div key={r.clienteId} className="px-3 md:px-4 py-2 flex items-center gap-3 text-xs">
              <span className="text-sm text-ink truncate flex-1">{nome}</span>
              <span className="font-mono text-muted">{r.total} tasks</span>
              <span className="font-mono">B{r.bug} · F{r.feature} · D{r.discovery} · M{r.manutencao} · A{r.admin} · ?{r.semTipo}</span>
            </div>
          );
        })}
      </HCard>

      {/* N.4 · Estimativa × realizado */}
      <HCard id="n4" title="N.4 · Estimativa vs. realizado (gap >50%)" count={n4.length}
        collapsed={collapsed.has('n4')} onToggle={() => toggle('n4')}>
        {n4.slice(0, 30).map((x) => (
          <button key={x.taskId} type="button" onClick={() => openEdit(x.taskId)}
            className="w-full text-left px-3 md:px-4 py-2 flex items-center gap-3 hover:bg-[var(--surface-3)]">
            <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0',
              x.tipo === 'estourou' ? 'bg-[var(--p0-soft)] text-[var(--danger)]' : 'bg-[var(--brand-soft)] text-[var(--brand-dark)]')}>
              {x.tipo === 'estourou' ? `+${Math.round((x.ratio - 1) * 100)}%` : `-${Math.round((1 - x.ratio) * 100)}%`}
            </span>
            <span className="text-sm text-ink truncate flex-1">{x.titulo}</span>
            <span className="text-[11px] font-mono text-muted shrink-0">{x.esforco}h → {x.real}h</span>
          </button>
        ))}
      </HCard>

      {/* N.5 · Velocidade individual */}
      <HCard id="n5" title="N.5 · Velocidade individual (concluídas últimas 4 semanas)" count={n5.length}
        collapsed={collapsed.has('n5')} onToggle={() => toggle('n5')}>
        {n5.map((r) => {
          const nome = pessoasById.get(r.pessoaId)?.nome ?? '—';
          return (
            <div key={r.pessoaId} className="px-3 md:px-4 py-2 flex items-center gap-3 text-xs">
              <span className="text-sm text-ink truncate flex-1">{nome}</span>
              <span className="font-mono text-muted">{r.concluidas} concluídas</span>
              <span className="font-mono">{r.porSemana}/sem</span>
            </div>
          );
        })}
      </HCard>

      {/* N.6 · Concentração de risco */}
      <HCard id="n6" title="N.6 · Concentração de throughput (bus factor)"
        count={n6.bus_factor_baixo ? 1 : 0}
        emptyMsg="✓ Throughput bem distribuído (nenhuma pessoa concentra >40%)"
        severity={n6.bus_factor_baixo ? 'alta' : null}
        collapsed={collapsed.has('n6')} onToggle={() => toggle('n6')}>
        <div className="px-3 md:px-4 py-3 text-xs">
          <div className="text-sm text-ink mb-1">
            {pessoasById.get(n6.topPessoaId ?? '')?.nome ?? '—'} concentra {Math.round(n6.topPessoaShare * 100)}% do throughput
          </div>
          <div className="text-muted">Total nas últimas 4 semanas: {n6.totalThroughput} tasks · Avaliar redundância de skill/cliente.</div>
        </div>
      </HCard>

      {/* N.7 · Bloqueios recorrentes por cliente */}
      <HCard id="n7" title="N.7 · Bloqueios recorrentes por cliente" count={n7.length}
        collapsed={collapsed.has('n7')} onToggle={() => toggle('n7')}>
        {n7.slice(0, 20).map((r) => {
          const nome = clientesById.get(r.clienteId)?.nome ?? '—';
          return (
            <div key={r.clienteId} className="px-3 md:px-4 py-2 flex items-center gap-3 text-xs">
              <span className="text-sm text-ink truncate flex-1">{nome}</span>
              <span className="font-mono text-muted">{r.total} bloqueada(s)</span>
              <span className="font-mono">Cliente {r.cliente} · Nós {r.nos} · Terceiro {r.terceiro}</span>
            </div>
          );
        })}
      </HCard>

      {/* N.8 · Tempo até aprovação cliente */}
      <HCard id="n8" title="N.8 · Tempo até aprovação cliente (homologacao → aprovacao)"
        count={n8.amostras}
        emptyMsg="Sem amostras com homologacao_em E aprovado_em preenchidos ainda"
        collapsed={collapsed.has('n8')} onToggle={() => toggle('n8')}>
        {n8.amostras > 0 && (
          <div className="px-3 md:px-4 py-2 text-xs">
            <div className="text-sm text-ink">
              Mediana: <b>{n8.medianaHoras}h</b> · P75: <b>{n8.p75Horas}h</b> · {n8.amostras} amostra(s)
            </div>
          </div>
        )}
        {n8.outliers.length > 0 && (
          <>
            <div className="px-3 md:px-4 py-1.5 bg-[var(--surface-3)] text-[10px] uppercase tracking-wide text-muted">Outliers (&gt;7d aguardando aprovação)</div>
            {n8.outliers.map((x) => (
              <button key={x.taskId} type="button" onClick={() => openEdit(x.taskId)}
                className="w-full text-left px-3 md:px-4 py-2 flex items-center gap-3 hover:bg-[var(--surface-3)]">
                <span className="text-[11px] font-mono text-muted shrink-0 w-16 text-right">{Math.round(x.horas / 24)}d</span>
                <span className="text-sm text-ink truncate flex-1">{x.titulo}</span>
              </button>
            ))}
          </>
        )}
      </HCard>

      {/* N.9 · Tasks privadas (só CEO) */}
      {isCEO && (
        <HCard id="n9" title="N.9 · Tasks privadas por pessoa" count={n9.length}
          collapsed={collapsed.has('n9')} onToggle={() => toggle('n9')}>
          {n9.map((r) => (
            <div key={r.pessoaId} className="px-3 md:px-4 py-2 flex items-center gap-3 text-xs">
              <span className="text-sm text-ink truncate flex-1">{pessoasById.get(r.pessoaId)?.nome ?? '—'}</span>
              <span className="font-mono text-muted">{r.count} privada(s)</span>
            </div>
          ))}
        </HCard>
      )}

      {/* N.10 · Cobertura critério de aceite */}
      <HCard id="n10" title={`N.10 · Cobertura critério de aceite (${n10.pct}%)`}
        count={n10.faltando.length}
        emptyMsg={n10.elegiveis === 0 ? 'Nenhuma task em escopo definido ou além' : '✓ Todas elegíveis têm critério preenchido'}
        collapsed={collapsed.has('n10')} onToggle={() => toggle('n10')}>
        <div className="px-3 md:px-4 py-2 text-xs text-muted">{n10.preenchidas}/{n10.elegiveis} elegíveis com critério preenchido</div>
        {n10.faltando.map((x) => (
          <button key={x.taskId} type="button" onClick={() => openEdit(x.taskId)}
            className="w-full text-left px-3 md:px-4 py-2 flex items-center gap-3 hover:bg-[var(--surface-3)]">
            <span className="text-sm text-ink truncate flex-1">{x.titulo}</span>
            <span className="text-[11px] text-muted shrink-0">{clientesById.get(x.clienteId)?.nome ?? '—'}</span>
          </button>
        ))}
      </HCard>

      {/* N.11 · Cobertura valor entregue */}
      <HCard id="n11" title={`N.11 · Cobertura valor entregue (${n11.pct}%)`}
        count={n11.faltando.length}
        emptyMsg={n11.concluidas === 0 ? 'Nenhuma task concluída' : '✓ Todas concluídas têm valor entregue preenchido'}
        collapsed={collapsed.has('n11')} onToggle={() => toggle('n11')}>
        <div className="px-3 md:px-4 py-2 text-xs text-muted">{n11.preenchidas}/{n11.concluidas} concluídas com valor entregue</div>
        {n11.faltando.map((x) => (
          <button key={x.taskId} type="button" onClick={() => openEdit(x.taskId)}
            className="w-full text-left px-3 md:px-4 py-2 flex items-center gap-3 hover:bg-[var(--surface-3)]">
            <span className="text-sm text-ink truncate flex-1">{x.titulo}</span>
            <span className="text-[11px] text-muted shrink-0">{clientesById.get(x.clienteId)?.nome ?? '—'}</span>
          </button>
        ))}
      </HCard>

      {/* N.12 · WIP excessivo por pessoa */}
      <HCard id="n12" title="N.12 · WIP excessivo por pessoa (≥5 ativas)" count={n12.length}
        collapsed={collapsed.has('n12')} onToggle={() => toggle('n12')}>
        {n12.map((r) => (
          <div key={r.pessoaId} className="px-3 md:px-4 py-2 flex items-center gap-3 text-xs">
            <span className="text-sm text-ink truncate flex-1">{pessoasById.get(r.pessoaId)?.nome ?? '—'}</span>
            <span className="font-mono">Dev {r.emDesenvolvimento} · Homolog {r.emHomologacao}</span>
            <span className="font-mono text-muted">total {r.total}</span>
          </div>
        ))}
      </HCard>

      {/* N.13 · Prazo desalinhado (passado mas não concluída) */}
      <HCard id="n13" title="N.13 · Prazo desalinhado (vencido + aberta)" count={n13.length}
        collapsed={collapsed.has('n13')} onToggle={() => toggle('n13')}>
        {n13.slice(0, 30).map((x) => (
          <button key={x.taskId} type="button" onClick={() => openEdit(x.taskId)}
            className="w-full text-left px-3 md:px-4 py-2 flex items-center gap-3 hover:bg-[var(--surface-3)]">
            <span className="text-[11px] font-mono text-[var(--danger)] shrink-0 w-12 text-right">{x.diasAtraso}d</span>
            <span className="text-sm text-ink truncate flex-1">{x.titulo}</span>
            <span className="text-[11px] text-muted shrink-0">{clientesById.get(x.clienteId)?.nome ?? '—'}</span>
          </button>
        ))}
      </HCard>

      {/* N.14 · Sem responsável */}
      <HCard id="n14" title="N.14 · Sem responsável atribuído" count={n14.length}
        collapsed={collapsed.has('n14')} onToggle={() => toggle('n14')}>
        {n14.slice(0, 30).map((x) => (
          <button key={x.taskId} type="button" onClick={() => openEdit(x.taskId)}
            className="w-full text-left px-3 md:px-4 py-2 flex items-center gap-3 hover:bg-[var(--surface-3)]">
            <span className="text-[11px] font-mono text-muted shrink-0 w-12 text-right">{x.diasParado}d</span>
            <span className="text-sm text-ink truncate flex-1">{x.titulo}</span>
            <span className="text-[11px] text-muted shrink-0">{x.subetapa}</span>
          </button>
        ))}
      </HCard>

      {/* N.15 · Sem projeto */}
      <HCard id="n15" title="N.15 · Sem projeto atribuído" count={n15.length}
        collapsed={collapsed.has('n15')} onToggle={() => toggle('n15')}>
        {n15.slice(0, 30).map((x) => (
          <button key={x.taskId} type="button" onClick={() => openEdit(x.taskId)}
            className="w-full text-left px-3 md:px-4 py-2 flex items-center gap-3 hover:bg-[var(--surface-3)]">
            <span className="text-sm text-ink truncate flex-1">{x.titulo}</span>
            <span className="text-[11px] text-muted shrink-0">{clientesById.get(x.clienteId)?.nome ?? '—'}</span>
          </button>
        ))}
      </HCard>

      {/* N.16 · Sem update há +7d */}
      <HCard id="n16" title="N.16 · Sem atualização há +7 dias" count={n16.length}
        collapsed={collapsed.has('n16')} onToggle={() => toggle('n16')}>
        {n16.slice(0, 30).map((x) => (
          <button key={x.taskId} type="button" onClick={() => openEdit(x.taskId)}
            className="w-full text-left px-3 md:px-4 py-2 flex items-center gap-3 hover:bg-[var(--surface-3)]">
            <span className="text-[11px] font-mono text-muted shrink-0 w-12 text-right">{x.diasSemUpdate}d</span>
            <span className="text-sm text-ink truncate flex-1">{x.titulo}</span>
            <span className="text-[11px] text-muted shrink-0">{pessoasById.get(x.pessoaId)?.nome.split(' ')[0] ?? '—'}</span>
          </button>
        ))}
      </HCard>

      {/* N.17 · Triagem atrasada (IA/cliente > 48h) */}
      <HCard id="n17" title="N.17 · Triagem atrasada (IA/cliente > 48h)" count={n17.length}
        collapsed={collapsed.has('n17')} onToggle={() => toggle('n17')}>
        {n17.slice(0, 30).map((x) => (
          <button key={x.taskId} type="button" onClick={() => openEdit(x.taskId)}
            className="w-full text-left px-3 md:px-4 py-2 flex items-center gap-3 hover:bg-[var(--surface-3)]">
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 bg-[var(--surface-3)] text-muted">{x.origem}</span>
            <span className="text-[11px] font-mono text-muted shrink-0 w-16 text-right">{x.horasNaFila}h</span>
            <span className="text-sm text-ink truncate flex-1">{x.titulo}</span>
            <span className="text-[11px] text-muted shrink-0">{clientesById.get(x.clienteId)?.nome ?? '—'}</span>
          </button>
        ))}
      </HCard>

      {/* N.18 · Origem da demanda por cliente */}
      <HCard id="n18" title="N.18 · Origem da demanda (manual / IA / cliente)" count={n18.length}
        collapsed={collapsed.has('n18')} onToggle={() => toggle('n18')}>
        {n18.slice(0, 20).map((r) => (
          <div key={r.clienteId} className="px-3 md:px-4 py-2 flex items-center gap-3 text-xs">
            <span className="text-sm text-ink truncate flex-1">{clientesById.get(r.clienteId)?.nome ?? '—'}</span>
            <span className="font-mono text-muted">{r.total} total</span>
            <span className="font-mono">manual {r.manual} · IA {r.ia} · cliente {r.cliente}</span>
          </div>
        ))}
      </HCard>

      </div>
    </div>
  );
}

