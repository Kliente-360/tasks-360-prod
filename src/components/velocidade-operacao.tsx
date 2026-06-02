'use client';

/**
 * Bloco "Velocidade da operação" — 4 cards de métricas operacionais.
 *
 * Movido do Briefing pro Dashboard em jun/2026 (decisão Felipe):
 * Briefing fica pra leitura editorial, Dashboard concentra os números.
 *
 * Cards (ordem fixa):
 *   1. Throughput W-0 (esta semana · com tendência projetada)
 *   2. Throughput W-1 (semana passada · com delta vs W-2)
 *   3. Ciclo (andamento → concluído · 30d)
 *   4. % no prazo (last 30d)
 *
 * Removido: card "Lead time" (criação → concluído) — pouco
 * acionável; lead time grande pode só significar "task ficou parada
 * no backlog" e não tem ação clara. W-0 substituiu.
 */

import { cn } from '@/lib/utils';
import type { VelocidadeMetrics } from '@/lib/heuristics';

interface VelocidadeOperacaoProps {
  vel: VelocidadeMetrics;
}

export function VelocidadeOperacao({ vel }: VelocidadeOperacaoProps) {
  return (
    <div className="bg-elev border border-line rounded-xl overflow-hidden">
      <div className="px-3 md:px-4 py-3 border-b border-line flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Velocidade da operação</h2>
        <span className="text-[10px] text-muted">
          throughput · ciclo · previsibilidade · 30d
        </span>
      </div>
      <div className="p-3 md:p-4 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {/* Card 1 · Throughput W-1 (semana passada — número fechado, baseline) */}
        <VelCard
          label="Throughput W-1"
          value={String(vel.throughputW1)}
          meta="meta ≥ 25/sem"
          sub="tasks concluídas na semana anterior"
          status={vel.throughputW1 >= 25 ? 'ok' : vel.throughputW1 >= 12 ? 'warn' : 'danger'}
          delta={
            vel.throughputW1 !== vel.throughputW2
              ? `${vel.throughputW1 > vel.throughputW2 ? '+' : ''}${vel.throughputW1 - vel.throughputW2} vs sem ant`
              : 'igual à sem ant'
          }
          deltaSign={
            vel.throughputW1 > vel.throughputW2 ? 'up'
            : vel.throughputW1 < vel.throughputW2 ? 'down' : 'neutral'
          }
        />

        {/* Card 2 · Throughput W-0 (esta semana · projeção) */}
        <VelCard
          label="Throughput W-0"
          value={String(vel.throughputW0)}
          meta={
            vel.throughputW0Projected != null
              ? `proj. ${vel.throughputW0Projected} · meta ≥ 25/sem`
              : 'meta ≥ 25/sem'
          }
          sub={
            vel.throughputW0Projected != null
              ? `${vel.abertasComPrazoNaSemana} abertas c/ prazo na semana × ${vel.pctNoPrazo}% no prazo`
              : 'tasks concluídas nesta semana'
          }
          status={
            vel.throughputW0Projected == null
              ? vel.throughputW0 >= 12 ? 'ok' : 'muted'
              : vel.throughputW0Projected >= 25 ? 'ok'
              : vel.throughputW0Projected >= 12 ? 'warn' : 'danger'
          }
          delta={
            vel.throughputW0Trend == null
              ? undefined
              : vel.throughputW0Trend === 'up'
              ? `proj. supera W-1 (${vel.throughputW1})`
              : vel.throughputW0Trend === 'down'
              ? `proj. abaixo de W-1 (${vel.throughputW1})`
              : `proj. igual à W-1 (${vel.throughputW1})`
          }
          deltaSign={vel.throughputW0Trend ?? 'neutral'}
        />

        {/* Card 3 · Ciclo · 30d vs 30d anterior */}
        <VelCard
          label="Ciclo"
          value={vel.cycleDias != null ? `${vel.cycleDias}d` : '—'}
          meta="meta ≤ 5d · 30d"
          sub="andamento → concluído"
          status={
            vel.cycleDias == null ? 'muted'
            : vel.cycleDias <= 5 ? 'ok'
            : vel.cycleDias <= 10 ? 'warn' : 'danger'
          }
          delta={
            vel.cycleDias != null && vel.cycleDiasPrev != null && vel.cycleDias !== vel.cycleDiasPrev
              ? `${vel.cycleDias < vel.cycleDiasPrev ? '−' : '+'}${Math.abs(Math.round((vel.cycleDias - vel.cycleDiasPrev) * 10) / 10)}d vs 30d ant`
              : vel.cycleDiasPrev == null && vel.cycleDias != null
              ? 'sem comparativo anterior'
              : undefined
          }
          // Menor ciclo = melhoria → 'up' (verde). Maior ciclo = piora → 'down' (vermelho).
          deltaSign={
            vel.cycleDias == null || vel.cycleDiasPrev == null ? 'neutral'
            : vel.cycleDias < vel.cycleDiasPrev ? 'up'
            : vel.cycleDias > vel.cycleDiasPrev ? 'down' : 'neutral'
          }
        />

        {/* Card 4 · % no prazo · 30d vs 30d anterior */}
        <VelCard
          label="% no prazo"
          value={vel.pctNoPrazo != null ? `${vel.pctNoPrazo}%` : '—'}
          meta="meta ≥ 80% · 30d"
          sub={
            vel.pctNoPrazoBases > 0
              ? `${vel.pctNoPrazoOk}/${vel.pctNoPrazoBases} entregas com prazo`
              : 'sem entregas com prazo em 30d'
          }
          status={
            vel.pctNoPrazo == null ? 'muted'
            : vel.pctNoPrazo >= 80 ? 'ok'
            : vel.pctNoPrazo >= 50 ? 'warn' : 'danger'
          }
          delta={
            vel.pctNoPrazo != null && vel.pctNoPrazoPrev != null && vel.pctNoPrazo !== vel.pctNoPrazoPrev
              ? `${vel.pctNoPrazo > vel.pctNoPrazoPrev ? '+' : ''}${vel.pctNoPrazo - vel.pctNoPrazoPrev}pp vs 30d ant`
              : vel.pctNoPrazoPrev == null && vel.pctNoPrazo != null
              ? 'sem comparativo anterior'
              : undefined
          }
          // Mais % no prazo = melhoria
          deltaSign={
            vel.pctNoPrazo == null || vel.pctNoPrazoPrev == null ? 'neutral'
            : vel.pctNoPrazo > vel.pctNoPrazoPrev ? 'up'
            : vel.pctNoPrazo < vel.pctNoPrazoPrev ? 'down' : 'neutral'
          }
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
  );
}

interface VelCardProps {
  label: string;
  value: string;
  sub: string;
  meta: string;
  status: 'ok' | 'warn' | 'danger' | 'muted';
  delta?: string;
  deltaSign?: 'up' | 'down' | 'neutral';
}

function VelCard({ label, value, sub, meta, status, delta, deltaSign }: VelCardProps) {
  const valueColor =
    status === 'ok' ? 'text-[var(--brand-dark)]'
    : status === 'warn' ? 'text-[var(--warn)]'
    : status === 'danger' ? 'text-[var(--danger)]'
    : 'text-[var(--ink)]';
  const dotColor =
    status === 'ok' ? 'bg-[var(--brand)]'
    : status === 'warn' ? 'bg-[var(--warn)]'
    : status === 'danger' ? 'bg-[var(--danger)]'
    : 'bg-[var(--line-strong)]';
  return (
    <div className="bg-elev border border-line rounded-xl p-3 md:p-4 flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted leading-none">
          {label}
        </div>
        <span className={cn('w-2 h-2 rounded-full shrink-0', dotColor)} />
      </div>
      <div className={cn('text-2xl md:text-3xl font-semibold tabular-nums leading-none mt-1', valueColor)}>
        {value}
      </div>
      {delta && (
        <div className={cn(
          'text-[11px] mt-0.5',
          deltaSign === 'up' ? 'text-[var(--brand)]'
          : deltaSign === 'down' ? 'text-[var(--danger)]'
          : 'text-muted',
        )}>
          {deltaSign === 'up' ? '▲' : deltaSign === 'down' ? '▼' : '●'} {delta}
        </div>
      )}
      <div className="text-[10px] text-muted mt-0.5">{meta}</div>
      <div className="text-[10px] text-muted hidden md:block">{sub}</div>
    </div>
  );
}
