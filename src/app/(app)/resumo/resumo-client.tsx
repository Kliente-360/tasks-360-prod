'use client';

import { useMemo } from 'react';
import { useData } from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
import { cn } from '@/lib/utils';
import { atrasada, isPreTriagem } from '@/lib/task-utils';
import {
  computeVelocidade,
  computeCalendario,
  computeHeuristicAlerts,
  computeWeeklyCapacityAnalysis,
} from '@/lib/heuristics';
import { VelocidadeOperacao } from '@/components/velocidade-operacao';

// ─────────────────────────────────────────────────────────
//  Helpers visuais
// ─────────────────────────────────────────────────────────

function heatmapColor(nivel: string) {
  if (nivel === 'sobrecarga') return 'bg-[var(--p0-soft)] text-[var(--p0)] font-semibold';
  if (nivel === 'pressao') return 'bg-[var(--p1-soft)] text-[var(--warn)] font-semibold';
  if (nivel === 'ok') return 'bg-[var(--brand-tint)] text-[var(--brand-dark)]';
  return 'bg-[var(--surface-3)] text-[var(--muted)]';
}

function severityColor(s: string) {
  if (s === 'alta') return 'text-[var(--danger)] bg-[var(--p0-soft)] border-[var(--p0)]';
  if (s === 'media') return 'text-[var(--warn)] bg-[var(--p1-soft)] border-[var(--p1)]';
  return 'text-[var(--muted)] bg-[var(--surface-3)] border-[var(--line)]';
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

const WEEK_LABELS_SHORT = ['Agora', '+1s', '+2s', '+3s'];

// ─────────────────────────────────────────────────────────
//  Componente principal
// ─────────────────────────────────────────────────────────

export function ResumoClient() {
  const { tasks, clientes, projetos, pessoas, loading } = useData();
  const { openEdit } = useTaskModal();

  const baseTasks = useMemo(() => tasks.filter((t) => !t.arquivadoEm && !isPreTriagem(t)), [tasks]);

  // ── 1 · Alertas
  const heuristicAlerts = useMemo(
    () => computeHeuristicAlerts(baseTasks, clientes, projetos, pessoas),
    [baseTasks, clientes, projetos, pessoas],
  );
  const countAlta = heuristicAlerts.filter((a) => a.severity === 'alta').length;
  const countMedia = heuristicAlerts.filter((a) => a.severity === 'media').length;

  // ── 2 · Velocidade
  const vel = useMemo(() => computeVelocidade(baseTasks), [baseTasks]);

  // ── 3 · Capacidade do time
  const wca = useMemo(
    () => computeWeeklyCapacityAnalysis(baseTasks, clientes, projetos, pessoas),
    [baseTasks, clientes, projetos, pessoas],
  );

  // ── 4 · Calendário
  const calendario = useMemo(() => computeCalendario(baseTasks), [baseTasks]);
  const calWeeks = useMemo(() => {
    const w: (typeof calendario)[] = [];
    for (let i = 0; i < calendario.length; i += 7) {
      const week = calendario.slice(i, i + 7);
      w.push([week[6], ...week.slice(0, 6)]);
    }
    return w;
  }, [calendario]);

  // ── 5 · P0/P1 atrasadas
  const clientesById = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const projetosById = useMemo(() => new Map(projetos.map((p) => [p.id, p])), [projetos]);
  const pessoasById = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);
  const p0p1Atrasadas = useMemo(() =>
    baseTasks
      .filter((t) => (t.prioridade === 'P0' || t.prioridade === 'P1') && atrasada(t) && t.status !== 'concluido')
      .map((t) => ({ ...t, diasAtraso: Math.floor((Date.now() - new Date(t.prazo).getTime()) / 86400000) }))
      .sort((a, b) => b.diasAtraso - a.diasAtraso),
    [baseTasks],
  );

  if (loading) return <div className="text-muted text-sm py-8">Carregando…</div>;

  const todayLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'short',
  }).replace('.', '').replace('-feira', '');

  return (
    <div>
      <div className="m-pagetitle">
        <h1>Resumo executivo</h1>
        <div className="narr">
          operação<span className="sep">·</span><b>{todayLabel}</b>
        </div>
      </div>

      <div className="space-y-4">

        {/* ── 1 · Alertas ── */}
        <div className="bg-elev border border-line rounded-xl p-3">
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
          </div>
          {heuristicAlerts.length === 0 ? (
            <div className="text-sm text-muted">✓ Nenhum alerta no momento</div>
          ) : (
            <div className="grid gap-2">
              {heuristicAlerts.map((a, i) => (
                <div key={i} className={cn('border rounded-lg px-3 py-2 text-sm', severityColor(a.severity))}>
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 text-xs font-bold mt-0.5 opacity-60">
                      {a.severity === 'alta' ? '●' : '○'}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium leading-snug text-[13px]">{a.titulo}</div>
                      {a.detalhe && (
                        <div className="text-xs opacity-75 mt-1 leading-snug">{a.detalhe}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 2 · Velocidade da operação ── */}
        <VelocidadeOperacao vel={vel} />

        {/* ── 3 · Capacidade do time ── */}
        <div className="bg-elev border border-line rounded-xl overflow-hidden">
          <div className="px-3 py-3 border-b border-line flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Capacidade do time</h2>
            <div className="flex items-center gap-2 text-[10px] text-muted">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-[var(--p0-soft)] inline-block" />
                Sobrecarga
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-[var(--p1-soft)] inline-block" />
                Pressão
              </span>
            </div>
          </div>
          {wca.pessoas.filter((p) => p.weeks.some((w) => w.hours > 0)).length === 0 ? (
            <div className="px-4 py-5 text-sm text-muted">Nenhum dado de capacidade</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="px-3 py-3" style={{ minWidth: 300 }}>
                <div className="grid gap-1 mb-1.5" style={{ gridTemplateColumns: '72px repeat(4, 1fr)' }}>
                  <div />
                  {WEEK_LABELS_SHORT.map((l) => (
                    <div key={l} className="text-center text-[10px] text-muted font-medium uppercase tracking-wide">{l}</div>
                  ))}
                </div>
                <div className="space-y-1">
                  {wca.pessoas.filter((p) => p.weeks.some((w) => w.hours > 0)).map((p) => (
                    <div key={p.pessoaId} className="grid gap-1 items-center" style={{ gridTemplateColumns: '72px repeat(4, 1fr)' }}>
                      <div className="text-xs text-ink truncate pr-1" title={p.nome}>{p.nome.split(' ')[0]}</div>
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

        {/* ── 4 · Calendário de entregas ── */}
        <div className="bg-elev border border-line rounded-xl">
          <div className="px-3 py-3 border-b border-line">
            <h2 className="text-sm font-semibold text-ink">Calendário de entregas</h2>
            <p className="text-[10px] text-muted mt-0.5">tarefas por dia · semana passada + atual + 4</p>
          </div>
          <div className="p-2">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map((d) => (
                <div key={d} className="text-center text-[9px] font-medium uppercase tracking-wide text-muted">{d}</div>
              ))}
            </div>
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
                      <span
                        className={cn('absolute bottom-1 right-1 text-white rounded-full flex items-center justify-center font-bold', calBadgeBg(dia))}
                        style={{ fontSize: 9, minWidth: 16, height: 16, padding: '0 3px' }}
                      >
                        {dia.count}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── 5 · P0 e P1 atrasadas ── */}
        <div className="bg-elev border border-line rounded-xl overflow-hidden">
          <div className="px-3 py-3 border-b border-line">
            <h2 className="text-sm font-semibold text-ink">P0 e P1 atrasadas</h2>
            <p className="text-[10px] text-muted mt-0.5">prazo vencido e ainda abertas</p>
          </div>
          <div className="divide-y divide-line">
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
                  <span className={cn(
                    'text-[9px] px-1 py-0.5 rounded font-mono',
                    t.prioridade === 'P0' ? 'bg-[var(--p0-soft)] text-[var(--danger)]' : 'bg-[var(--p1-soft)] text-[var(--warn)]',
                  )}>
                    {t.prioridade}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
