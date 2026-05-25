'use client';

/**
 * Briefing executivo — Onda 1 · feat/dashboard-briefing
 *
 * Bloco 1 · Headline IA (placeholder — aguarda ai-weekly-summary)
 * Bloco 2 · Clientes em atenção (sinal vermelho/âmbar ≥ 3 dias)
 * Bloco 3 · Heatmap portfólio pessoa × semana W0–W3
 * Bloco 4 · Orçamento por projeto (barras de progresso)
 * Bloco 5 · Conquistas W-1 + sugestões de redistribuição
 *
 * Sem filtros — visão de portfólio completo.
 * Dados ao vivo (DataProvider in-memory).
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data-store';
import { cn } from '@/lib/utils';
import { atrasada, agingDays } from '@/lib/task-utils';
import {
  computeWeeklyCapacityAnalysis,
  computeProjetosSaude,
  computeThroughput,
  type ProjetoFechadoCapacidade,
  type WeekData,
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

// ─────────────────────────────────────────────────────────
//  Componente principal
// ─────────────────────────────────────────────────────────

export function BriefingClient() {
  const { tasks, clientes, projetos, pessoas, loading, refreshing } = useData();

  const baseTasks = useMemo(() => tasks.filter((t) => !t.arquivadoEm), [tasks]);

  // Semáforo de projetos → agrupa por cliente para bloco 2
  const projetosSaude = useMemo(
    () => computeProjetosSaude(baseTasks, projetos, clientes),
    [baseTasks, projetos, clientes],
  );

  const clientesById = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);

  // Clientes em atenção: pelo menos 1 projeto vermelho ou âmbar há ≥3 dias
  const clientesAtencao = useMemo(() => {
    const cliMap = new Map<
      string,
      { nomeCliente: string; motivos: string[]; sinalMax: 'vermelho' | 'amarelo' }
    >();
    for (const ps of projetosSaude) {
      if (ps.sinal === 'verde') continue;
      const existing = cliMap.get(ps.clienteId);
      const sinalMax =
        ps.sinal === 'vermelho'
          ? 'vermelho'
          : existing?.sinalMax === 'vermelho'
          ? 'vermelho'
          : 'amarelo';
      if (existing) {
        existing.motivos.push(`${ps.nome}: ${ps.motivo}`);
        existing.sinalMax = sinalMax;
      } else {
        cliMap.set(ps.clienteId, {
          nomeCliente: ps.nomeCliente,
          motivos: [`${ps.nome}: ${ps.motivo}`],
          sinalMax,
        });
      }
    }
    return Array.from(cliMap.entries())
      .map(([clienteId, v]) => ({ clienteId, ...v }))
      .sort((a, b) => (a.sinalMax === 'vermelho' ? -1 : b.sinalMax === 'vermelho' ? 1 : 0));
  }, [projetosSaude]);

  // Capacidade semanal (portfólio completo)
  const wca = useMemo(
    () => computeWeeklyCapacityAnalysis(baseTasks, clientes, projetos, pessoas),
    [baseTasks, clientes, projetos, pessoas],
  );

  // Conquistas W-1
  const throughput = useMemo(() => computeThroughput(baseTasks), [baseTasks]);
  const throughputW1 = throughput[throughput.length - 2]?.count ?? 0;

  // Tasks concluídas na semana W-1
  const concluidas = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const offsetSeg = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - offsetSeg);
    const lastMonday = new Date(monday);
    lastMonday.setDate(monday.getDate() - 7);

    return baseTasks
      .filter((t) => {
        if (t.status !== 'concluido' || !t.statusEm) return false;
        const d = new Date(t.statusEm);
        return d >= lastMonday && d < monday;
      })
      .slice(0, 5);
  }, [baseTasks]);

  // Sugestões de redistribuição simples (de wca)
  const sugestoes = useMemo(() => {
    const out: string[] = [];
    for (const p of wca.pessoas) {
      const overIdx = p.weeks.findIndex((w) => w.nivel === 'sobrecarga' || w.nivel === 'pressao');
      if (overIdx < 0) continue;
      const folga = wca.pessoas.find(
        (other) => other.pessoaId !== p.pessoaId && other.weeks[overIdx].nivel === 'folga',
      );
      if (folga) {
        const semLabel = overIdx === 0 ? 'esta semana' : overIdx === 1 ? 'próxima semana' : `em ${overIdx} semanas`;
        out.push(`${p.nome.split(' ')[0]} em sobrecarga ${semLabel} — considerar ${folga.nome.split(' ')[0]} (folga)`);
      }
      if (out.length >= 3) break;
    }
    return out;
  }, [wca]);

  const weekLabels = ['Esta sem.', 'Próx. sem.', 'Em 2 sem.', 'Em 3 sem.'];

  if (loading) {
    return (
      <div className="text-muted text-sm py-8">Carregando…</div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">

      {/* ── Page bar · desktop only ── */}
      <div className="page-bar hidden md:flex">
        <div className="page-bar-info">
          <span className="page-bar-narrative">
            Briefing
            <span className="text-muted font-normal text-sm ml-2">
              {refreshing ? '· atualizando…' : '· portfólio ao vivo'}
            </span>
          </span>
        </div>
        <div className="page-bar-controls">
          <Link href="/dashboard" className="btn btn-ghost text-xs">← Dashboard</Link>
          <button onClick={() => window.print()} className="btn btn-ghost text-xs">
            Exportar PDF
          </button>
        </div>
      </div>

      {/* ── Bloco 1 · Headline IA ── */}
      <div className="bg-elev border border-line rounded-xl p-3 md:p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-wide text-muted">Resumo executivo</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-3)] text-muted border border-line">
            IA · em breve
          </span>
        </div>
        <p className="text-sm text-muted italic leading-relaxed">
          O resumo por IA estará disponível com o{' '}
          <span className="font-medium">ai-weekly-summary</span>. Consulte os blocos abaixo.
        </p>
      </div>

      {/* ── Bloco 2 · Clientes em atenção ── */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden">
        <div className="px-3 md:px-4 py-3 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Clientes em atenção</h2>
          <span className="text-xs text-muted">
            {clientesAtencao.length === 0 ? 'Todos saudáveis ✓' : `${clientesAtencao.length} cliente(s)`}
          </span>
        </div>
        {clientesAtencao.length === 0 ? (
          <div className="px-4 py-5 text-sm text-[var(--brand)]">
            ✓ Nenhum cliente com projetos em alerta neste momento.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {clientesAtencao.map((c) => (
              <div key={c.clienteId} className="px-4 py-3 flex items-start gap-3">
                <span
                  className={cn(
                    'shrink-0 mt-0.5 w-2.5 h-2.5 rounded-full',
                    c.sinalMax === 'vermelho' ? 'bg-[var(--danger)]' : 'bg-[var(--warn)]',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">{c.nomeCliente}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {c.motivos.slice(0, 2).join(' · ')}
                    {c.motivos.length > 2 && ` · +${c.motivos.length - 2} mais`}
                  </div>
                </div>
                <Link
                  href={`/dashboard?cliente=${c.clienteId}`}
                  className="shrink-0 text-xs text-[var(--brand)] font-medium py-1 px-2 rounded hover:bg-[var(--brand-tint)] transition-colors"
                >
                  <span className="hidden sm:inline">Ver detalhes </span>→
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Bloco 3 · Heatmap portfólio ── */}
      <div className="bg-elev border border-line rounded-xl overflow-hidden">
        <div className="px-3 md:px-4 py-3 border-b border-line flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Capacidade portfólio</h2>
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
        </div>
        {wca.pessoas.length === 0 ? (
          <div className="px-4 py-5 text-sm text-muted">Nenhum dado de capacidade</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="px-3 md:px-4 py-3" style={{ minWidth: 300 }}>
              <div className="grid gap-1 mb-1.5" style={{ gridTemplateColumns: '72px repeat(4, 1fr)' }}>
                <div />
                {(['Agora', '+1s', '+2s', '+3s'] as const).map((l, i) => (
                  <div key={l} className="text-center text-[10px] text-muted font-medium uppercase tracking-wide">
                    <span className="md:hidden">{l}</span>
                    <span className="hidden md:inline">{weekLabels[i]}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                {wca.pessoas.map((p) => (
                  <div key={p.pessoaId} className="grid gap-1 items-center" style={{ gridTemplateColumns: '72px repeat(4, 1fr)' }}>
                    <div className="text-xs text-ink truncate pr-1" title={p.nome}>
                      {p.nome.split(' ')[0]}
                    </div>
                    {p.weeks.map((wk, i) => (
                      <div
                        key={i}
                        className={cn('text-center text-[11px] py-1.5 rounded font-mono', heatmapColor(wk.nivel))}
                        title={`${wk.hours}h`}
                      >
                        {wk.pctCap != null ? `${wk.pctCap}%` : '—'}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bloco 4 · Orçamento por projeto ── */}
      {wca.projetosFechados.length > 0 && (
        <div className="bg-elev border border-line rounded-xl overflow-hidden">
          <div className="px-3 md:px-4 py-3 border-b border-line">
            <h2 className="text-sm font-semibold text-ink">Orçamento · projetos fechados</h2>
          </div>
          <div className="divide-y divide-line">
            {wca.projetosFechados.map((p) => (
              <div key={p.projetoId} className="px-3 md:px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-ink truncate">{p.nome}</span>
                  <span
                    className={cn(
                      'text-xs font-bold tabular-nums shrink-0 ml-2',
                      p.estourado ? 'text-[var(--danger)]' : p.risco ? 'text-[var(--warn)]' : 'text-muted',
                    )}
                  >
                    {p.pctEsgotamento}%
                  </span>
                </div>
                <div className={cn('w-full h-2 rounded-full', budgetBg(p.pctEsgotamento))}>
                  <div
                    className={cn('h-2 rounded-full', budgetColor(p.pctEsgotamento))}
                    style={{ width: `${Math.min(p.pctEsgotamento, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted mt-1">
                  <span>{p.usado}h usadas · {p.comprometido}h comprometidas</span>
                  <span className="shrink-0 ml-2">{p.orcTotal}h total</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bloco 5 · Conquistas + sugestões ── */}
      <div className="grid md:grid-cols-2 gap-3 md:gap-4">
        {/* Conquistas W-1 */}
        <div className="bg-elev border border-line rounded-xl overflow-hidden">
          <div className="px-3 md:px-4 py-3 border-b border-line flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Conquistas · W-1</h2>
            <span className="text-xs font-bold text-[var(--brand)] tabular-nums">
              {throughputW1} tarefa{throughputW1 !== 1 ? 's' : ''}
            </span>
          </div>
          {concluidas.length === 0 ? (
            <div className="px-4 py-5 text-sm text-muted">
              Nenhuma tarefa concluída na semana anterior.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {concluidas.map((t) => (
                <div key={t.id} className="px-3 md:px-4 py-2.5">
                  <div className="text-sm text-ink truncate">{t.titulo}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {clientesById.get(t.clienteId)?.nome ?? '—'}
                  </div>
                </div>
              ))}
              {throughputW1 > 5 && (
                <div className="px-3 md:px-4 py-2 text-xs text-muted">
                  + {throughputW1 - 5} outras tarefas concluídas
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sugestões de redistribuição */}
        <div className="bg-elev border border-line rounded-xl overflow-hidden">
          <div className="px-3 md:px-4 py-3 border-b border-line">
            <h2 className="text-sm font-semibold text-ink">Redistribuição</h2>
          </div>
          {sugestoes.length === 0 ? (
            <div className="px-4 py-5 text-sm text-muted">
              ✓ Capacidade equilibrada nas próximas 4 semanas.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {sugestoes.map((s, i) => (
                <div key={i} className="px-3 md:px-4 py-3 flex items-start gap-2">
                  <span className="text-[var(--warn)] shrink-0 mt-0.5 text-sm">⚠</span>
                  <span className="text-sm text-ink leading-snug">{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
