'use client';

/**
 * Card "Horas por semana" (Dashboard e Resumo executivo no celular).
 *
 * Barras empilhadas por cliente com o total de horas do Timesheet em cada
 * semana (segunda a domingo), mais a linha de tendência: média móvel das
 * últimas 4 semanas fechadas. A semana atual aparece mais clara e fica fora
 * da tendência, porque ainda está incompleta.
 *
 * Cores seguem o cliente, não a posição: os 5 clientes com mais horas na
 * janela inteira (antes dos filtros) ganham as cores fixas; o resto vira
 * "Outros". Filtrar por cliente não repinta ninguém.
 *
 * Dados: timeEntriesAnalise (janela de 90 dias do data-store, mesmo acesso
 * do Timesheet: interno só as próprias, admin todas, privado anônimo).
 */

import { useMemo, useState } from 'react';
import { useData, useTasksById, useClientesById } from '@/lib/data-store';
import type { Cliente, Task, TimeEntry } from '@/lib/types';

const SEMANAS = 12;
const DIA_MS = 86_400_000;
const MAX_CLIENTES = 5;
const JANELA_TENDENCIA = 4;

const fmtH = (h: number) => `${h.toLocaleString('pt-BR', { maximumFractionDigits: h >= 10 ? 0 : 1 })}h`;
const duracaoH = (e: TimeEntry) => ((e.endedAt ?? Date.now()) - e.startedAt) / 3_600_000;

function segundaDe(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export interface HorasSemanaFiltros {
  clienteId?: string;
  projetoId?: string;
  /** Quem lançou as horas */
  pessoaId?: string;
}

type Serie = { key: string; nome: string; cor: string };
type Semana = { inicio: number; rotulo: string; atual: boolean; total: number; porSerie: Map<string, number> };

export function HorasSemanaCard({ filtros = {}, filtrada = false }: { filtros?: HorasSemanaFiltros; filtrada?: boolean }) {
  const { timeEntriesAnalise, viewerRole } = useData();
  const tasksById = useTasksById();
  const clientesById = useClientesById();
  return (
    <HorasSemanaView
      entries={timeEntriesAnalise}
      tasksById={tasksById}
      clientesById={clientesById}
      titulo={viewerRole === 'admin' ? 'Horas por semana' : 'Suas horas por semana'}
      filtros={filtros}
      filtrada={filtrada}
    />
  );
}

/** Parte visual, sem depender do data-store (permite pré-visualizar com dados de teste). */
export function HorasSemanaView({
  entries: timeEntriesAnalise, tasksById, clientesById, titulo, filtros = {}, filtrada = false,
}: {
  entries: TimeEntry[];
  tasksById: Map<string, Pick<Task, 'clienteId' | 'projetoId'>>;
  clientesById: Map<string, Pick<Cliente, 'nome'>>;
  titulo: string;
  filtros?: HorasSemanaFiltros;
  filtrada?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const { semanas, series, max, tendencia, mediaRecente } = useMemo(() => {
    const segAtual = segundaDe(Date.now());
    const inicioJanela = segAtual - (SEMANAS - 1) * 7 * DIA_MS;
    const clienteDe = (e: TimeEntry) => (e.mascarada ? null : tasksById.get(e.taskId)?.clienteId ?? null);

    // Ranking de cores na janela inteira, antes dos filtros
    const totalPorCliente = new Map<string, number>();
    for (const e of timeEntriesAnalise) {
      if (e.startedAt < inicioJanela) continue;
      const c = clienteDe(e);
      if (c) totalPorCliente.set(c, (totalPorCliente.get(c) ?? 0) + duracaoH(e));
    }
    const top = [...totalPorCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CLIENTES).map(([id]) => id);
    const series: Serie[] = top.map((id, i) => ({ key: id, nome: clientesById.get(id)?.nome ?? '—', cor: `var(--hs-${i + 1})` }));
    series.push({ key: '__outros', nome: 'Outros', cor: 'var(--hs-outros)' });

    const semanas: Semana[] = Array.from({ length: SEMANAS }, (_, i) => {
      const inicio = inicioJanela + i * 7 * DIA_MS;
      const d = new Date(inicio);
      return {
        inicio,
        rotulo: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        atual: inicio === segAtual,
        total: 0,
        porSerie: new Map(),
      };
    });

    for (const e of timeEntriesAnalise) {
      if (e.startedAt < inicioJanela) continue;
      if (filtros.pessoaId && e.pessoaId !== filtros.pessoaId) continue;
      const t = e.mascarada ? undefined : tasksById.get(e.taskId);
      if (filtros.clienteId && t?.clienteId !== filtros.clienteId) continue;
      if (filtros.projetoId && t?.projetoId !== filtros.projetoId) continue;
      const idx = Math.floor((segundaDe(e.startedAt) - inicioJanela) / (7 * DIA_MS));
      const s = semanas[idx];
      if (!s) continue;
      const h = duracaoH(e);
      const c = t?.clienteId ?? null;
      const key = c && top.includes(c) ? c : '__outros';
      s.total += h;
      s.porSerie.set(key, (s.porSerie.get(key) ?? 0) + h);
    }

    // Tendência: média móvel das últimas 4 semanas fechadas (a atual fica de fora)
    const tendencia: (number | null)[] = semanas.map((s, i) => {
      if (s.atual || i < JANELA_TENDENCIA - 1) return null;
      const janela = semanas.slice(i - JANELA_TENDENCIA + 1, i + 1);
      return janela.reduce((a, x) => a + x.total, 0) / JANELA_TENDENCIA;
    });
    const fechadas = semanas.filter((s) => !s.atual);
    const ultimas = fechadas.slice(-JANELA_TENDENCIA);
    const mediaRecente = ultimas.length ? ultimas.reduce((a, s) => a + s.total, 0) / ultimas.length : 0;
    const max = Math.max(1, ...semanas.map((s) => s.total), ...tendencia.map((v) => v ?? 0));
    return { semanas, series, max, tendencia, mediaRecente };
  }, [timeEntriesAnalise, tasksById, clientesById, filtros.clienteId, filtros.projetoId, filtros.pessoaId]);

  // Escala com folga e grade em números redondos (3 a 4 linhas)
  const passo = max <= 8 ? 2 : max <= 16 ? 5 : max <= 36 ? 10 : max <= 90 ? 25 : 50;
  const topo = Math.ceil((max * 1.08) / passo) * passo;
  const grades = Array.from({ length: Math.round(topo / passo) }, (_, i) => (i + 1) * passo);
  const usadas = series.filter((s) => semanas.some((w) => (w.porSerie.get(s.key) ?? 0) > 0));
  const pontos = tendencia
    .map((v, i) => (v == null ? null : `${((i + 0.5) / SEMANAS) * 100},${100 - (v / topo) * 100}`))
    .filter(Boolean)
    .join(' ');
  const semanaHover = hover != null ? semanas[hover] : null;

  return (
    <div className="hs-card bg-elev border border-line rounded-xl overflow-hidden">
      <div className="px-3 md:px-4 py-3 border-b border-line flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{titulo}</h2>
          <p className="text-[10px] text-muted mt-0.5">
            {filtrada && <span className="text-[color:var(--green)] font-semibold">com filtros · </span>}
            timesheet · últimas {SEMANAS} semanas · por cliente
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-semibold tabular-nums leading-none text-ink">{fmtH(mediaRecente)}</div>
          <div className="text-[10px] text-muted mt-1">média das últimas {JANELA_TENDENCIA} semanas</div>
        </div>
      </div>

      <div className="px-3 md:px-4 pt-4 pb-3">
        <div className="relative h-48 ml-8">
          {/* Grade e eixo */}
          {grades.map((g) => (
            <div key={g} className="absolute left-0 right-0 border-t border-dashed border-line" style={{ bottom: `${(g / topo) * 100}%` }}>
              <span className="absolute -left-8 -translate-y-1/2 w-7 text-right text-[10px] text-muted tabular-nums">{fmtH(g)}</span>
            </div>
          ))}
          <div className="absolute left-0 right-0 bottom-0 border-t border-line" />

          {/* Barras empilhadas */}
          <div className="absolute inset-0 flex items-end gap-1.5 md:gap-2">
            {semanas.map((s, i) => (
              <div
                key={s.inicio}
                className="relative flex-1 h-full flex flex-col justify-end cursor-default"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                aria-label={`Semana de ${s.rotulo}: ${fmtH(s.total)}`}
              >
                <div
                  className="hs-pilha flex flex-col-reverse w-full rounded-t overflow-hidden"
                  style={{ height: `${(s.total / topo) * 100}%`, opacity: s.atual ? 0.5 : hover != null && hover !== i ? 0.6 : 1 }}
                >
                  {series.map((sr) => {
                    const h = s.porSerie.get(sr.key) ?? 0;
                    if (!h) return null;
                    return <div key={sr.key} style={{ flex: `${h} 0 0`, background: sr.cor }} />;
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Tendência: média móvel de 4 semanas fechadas */}
          {pontos && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <polyline points={pontos} fill="none" stroke="var(--ink)" strokeWidth={2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
          )}

          {/* Tooltip */}
          {semanaHover && hover != null && (
            <div
              className="absolute z-10 pointer-events-none bg-bg-elev border border-line rounded-lg shadow-lg px-3 py-2 text-[11px] min-w-[150px]"
              style={{
                bottom: `${Math.min(92, (semanaHover.total / topo) * 100 + 4)}%`,
                left: `${((hover + 0.5) / SEMANAS) * 100}%`,
                transform: `translateX(${hover > SEMANAS / 2 ? '-100%' : '0'})`,
              }}
            >
              <div className="font-semibold text-ink mb-1">
                Semana de {semanaHover.rotulo}{semanaHover.atual && ' · em andamento'}
              </div>
              {series.map((sr) => {
                const h = semanaHover.porSerie.get(sr.key) ?? 0;
                if (!h) return null;
                return (
                  <div key={sr.key} className="flex items-center gap-2 justify-between">
                    <span className="flex items-center gap-1.5 text-ink-soft truncate">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: sr.cor }} />
                      {sr.nome}
                    </span>
                    <span className="tabular-nums text-ink">{fmtH(h)}</span>
                  </div>
                );
              })}
              <div className="flex justify-between border-t border-line mt-1 pt-1 font-semibold text-ink">
                <span>Total</span>
                <span className="tabular-nums">{fmtH(semanaHover.total)}</span>
              </div>
              {tendencia[hover] != null && (
                <div className="flex justify-between text-muted">
                  <span>Tendência (4 sem.)</span>
                  <span className="tabular-nums">{fmtH(tendencia[hover]!)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Eixo X */}
        <div className="flex gap-1.5 md:gap-2 ml-8 mt-1.5">
          {semanas.map((s, i) => (
            <div key={s.inicio} className="flex-1 min-w-0 flex justify-center text-[10px] text-muted tabular-nums whitespace-nowrap">
              {/* Celular: um rótulo a cada 4 semanas (mais a atual); desktop: todos */}
              <span className={i % 4 !== 0 && !s.atual ? 'hidden md:inline' : undefined}>{s.atual ? 'atual' : s.rotulo}</span>
            </div>
          ))}
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-ink-soft">
          {usadas.map((sr) => (
            <span key={sr.key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: sr.cor }} />
              {sr.nome}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke="var(--ink)" strokeWidth="2" strokeDasharray="5 4" /></svg>
            tendência (média de {JANELA_TENDENCIA} semanas)
          </span>
        </div>
      </div>
    </div>
  );
}
