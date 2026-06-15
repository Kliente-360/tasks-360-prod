/**
 * analytics.ts — heurísticas operacionais e KPIs de saúde
 *
 * Funções puras — recebem os arrays do DataProvider como parâmetros.
 * Sem dependência de DOM, React ou Supabase.
 *
 * H1–H15  Alertas heurísticos (computeHeuristicAlerts)
 * C.2     Capacidade prevista (throughput vs backlog)
 * C.3     Skill mismatch (escopo da task vs skills da pessoa)
 * C.4     Senioridade malalocada (complexidade vs senioridade)
 * C.5     Churn risk por cliente (sinal composto)
 * C.7     Bottleneck por sub-etapa (tempo mediano em cada etapa)
 * C.8     SLA breach rate (por cliente / projeto / pessoa)
 */

import type { Cliente, Pessoa, Projeto, Task } from './types';
import { STATUS } from './task-constants';
import {
  agingDays,
  cargaNivelFromPctCap,
  effEsforco,
  effRemaining,
  effTamanho,
  atrasada,
  taskWeekIndex,
  triageFailures,
  type CargaNivel,
} from './task-utils';

// ─────────────────────────────────────────────────────────
//  Tipos
// ─────────────────────────────────────────────────────────

type HeuristicSeverity = 'alta' | 'media' | 'baixa';

export interface HeuristicAlert {
  severity: HeuristicSeverity;
  kind: string;
  titulo: string;
  detalhe: string;
  taskIds?: string[];
  pessoaIds?: string[];
  projetoIds?: string[];
  weekIdx?: number;
}

interface WeekData {
  hours: number;
  pctCap: number | null;
  nivel: CargaNivel;
}

interface PessoaCapacidade {
  pessoaId: string;
  nome: string;
  capacidade: number;
  weeks: [WeekData, WeekData, WeekData, WeekData];
  anyOverload: boolean;
}

interface SustentacaoCapacidade {
  projetoId: string;
  nome: string;
  clienteId: string;
  capSemanal: number;
  orcMensal: number;
  weeks: [WeekData, WeekData, WeekData, WeekData];
  estourando: boolean;
  ociosaFlag: boolean;
}

interface ProjetoFechadoCapacidade {
  projetoId: string;
  nome: string;
  clienteId: string;
  orcTotal: number;
  usado: number;
  comprometido: number;
  total: number;
  pctEsgotamento: number;
  countTasks: number;
  estourado: boolean;
  risco: boolean;
}

export interface WeeklyCapacityAnalysis {
  pessoas: PessoaCapacidade[];
  sustentacoes: SustentacaoCapacidade[];
  projetosFechados: ProjetoFechadoCapacidade[];
}

// ─────────────────────────────────────────────────────────
//  Helpers internos
// ─────────────────────────────────────────────────────────

function makeWeekData(hours: number, cap: number): WeekData {
  const pctCap = cap > 0 ? Math.round((hours / cap) * 100) : null;
  return { hours, pctCap, nivel: cargaNivelFromPctCap(pctCap) };
}

function semanaLabel(w: number): string {
  if (w === 0) return 'esta semana';
  if (w === 1) return 'próxima semana';
  return `em ${w} semanas`;
}

// ─────────────────────────────────────────────────────────
//  Análise de capacidade semanal
// ─────────────────────────────────────────────────────────

export function computeWeeklyCapacityAnalysis(
  tasks: Task[],
  _clientes: Cliente[],
  projetos: Projeto[],
  pessoas: Pessoa[],
  today?: string,
): WeeklyCapacityAnalysis {
  const todayRef = today ?? new Date().toISOString().slice(0, 10);
  const ativas = tasks.filter((t) => t.status !== STATUS.CONCLUIDO && !t.arquivadoEm);

  // ---- Pessoa × semana ----
  // Filtros: exclui clientes (não executam internamente) e PMs (não dividem
  // tasks com o time de dev). Soma usa effRemaining (esforço restante após
  // descontar horas já registradas em tempoRealHoras).
  const pessoaHours = new Map<string, [number, number, number, number]>();
  for (const p of pessoas) {
    if (p.role === 'cliente' || p.is_pm) continue;
    pessoaHours.set(p.id, [0, 0, 0, 0]);
  }
  for (const t of ativas) {
    if (!t.pessoaId) continue;
    const arr = pessoaHours.get(t.pessoaId);
    if (!arr) continue;
    const idx = taskWeekIndex(t, todayRef);
    if (idx === -1) arr[0] += effRemaining(t);
    else if (idx !== null) arr[idx] += effRemaining(t);
  }
  const pessoasResult: PessoaCapacidade[] = [];
  for (const p of pessoas) {
    if (p.role === 'cliente' || p.is_pm) continue;
    const cap = Number(p.capacidade_horas_semana) || 0;
    const hours = pessoaHours.get(p.id) ?? ([0, 0, 0, 0] as [number, number, number, number]);
    const weeks = hours.map((h) => makeWeekData(h, cap)) as [WeekData, WeekData, WeekData, WeekData];
    const anyOverload = weeks.some((w) => w.nivel === 'sobrecarga' || w.nivel === 'pressao');
    pessoasResult.push({ pessoaId: p.id, nome: p.nome, capacidade: cap, weeks, anyOverload });
  }
  pessoasResult.sort((a, b) => {
    const peakA = Math.max(...a.weeks.map((w) => w.pctCap ?? -1));
    const peakB = Math.max(...b.weeks.map((w) => w.pctCap ?? -1));
    return peakB - peakA;
  });

  // ---- Sustentação × semana ----
  // Soma usa effRemaining (esforço restante após descontar tempoRealHoras
  // declarado na task), consistente com o cálculo por pessoa. Antes usava
  // effEsforco bruto, o que inflava o consumo quando uma task já tinha
  // boa parte das horas registradas — mostrando capacidade fantasma.
  const sustHours = new Map<string, [number, number, number, number]>();
  for (const proj of projetos) {
    if (proj.arquivadoEm || proj.tipo !== 'sustentacao') continue;
    if (!(Number(proj.orcamentoHoras) > 0)) continue;
    sustHours.set(proj.id, [0, 0, 0, 0]);
  }
  for (const t of ativas) {
    if (!t.projetoId) continue;
    const arr = sustHours.get(t.projetoId);
    if (!arr) continue;
    const idx = taskWeekIndex(t, todayRef);
    if (idx === -1) arr[0] += effRemaining(t);
    else if (idx !== null) arr[idx] += effRemaining(t);
  }
  const sustentacoesResult: SustentacaoCapacidade[] = [];
  for (const proj of projetos) {
    if (proj.arquivadoEm || proj.tipo !== 'sustentacao') continue;
    const orcMensal = Number(proj.orcamentoHoras) || 0;
    if (!(orcMensal > 0)) continue;
    const capSem = orcMensal / 4;
    const hours = sustHours.get(proj.id) ?? ([0, 0, 0, 0] as [number, number, number, number]);
    const weeks = hours.map((h) => makeWeekData(h, capSem)) as [WeekData, WeekData, WeekData, WeekData];
    let ociosaStreak = 0;
    let ociosaFlag = false;
    for (const w of weeks) {
      if ((w.pctCap ?? 0) < 50) {
        ociosaStreak++;
        if (ociosaStreak >= 2) ociosaFlag = true;
      } else {
        ociosaStreak = 0;
      }
    }
    const estourando = weeks.some((w) => (w.pctCap ?? 0) > 100);
    sustentacoesResult.push({
      projetoId: proj.id,
      nome: proj.nome,
      clienteId: proj.clienteId,
      capSemanal: capSem,
      orcMensal,
      weeks,
      estourando,
      ociosaFlag,
    });
  }
  sustentacoesResult.sort((a, b) => {
    const sevA = a.estourando ? 2 : a.ociosaFlag ? 1 : 0;
    const sevB = b.estourando ? 2 : b.ociosaFlag ? 1 : 0;
    return sevB - sevA;
  });

  // ---- Projeto fechado × escopo total ----
  const clientesById = new Map(_clientes.map((c) => [c.id, c]));
  const projetosFechadosResult: ProjetoFechadoCapacidade[] = [];
  for (const proj of projetos) {
    if (proj.arquivadoEm || proj.tipo !== 'projeto') continue;
    if (clientesById.get(proj.clienteId)?.ehInterno) continue;
    const orcTotal = Number(proj.orcamentoHoras) || 0;
    if (!(orcTotal > 0)) continue;
    let usado = 0;
    let comprometido = 0;
    let countTasks = 0;
    for (const t of tasks) {
      if (t.projetoId !== proj.id || t.arquivadoEm) continue;
      countTasks++;
      if (t.status === STATUS.CONCLUIDO) {
        usado += Number(t.tempoRealHoras) || effEsforco(t);
      } else {
        comprometido += effEsforco(t);
      }
    }
    const total = usado + comprometido;
    const pctEsgotamento = orcTotal > 0 ? Math.round((total / orcTotal) * 100) : 0;
    projetosFechadosResult.push({
      projetoId: proj.id,
      nome: proj.nome,
      clienteId: proj.clienteId,
      orcTotal,
      usado,
      comprometido,
      total,
      pctEsgotamento,
      countTasks,
      estourado: pctEsgotamento > 110,
      risco: pctEsgotamento >= 90 && pctEsgotamento <= 110,
    });
  }
  projetosFechadosResult.sort((a, b) => b.pctEsgotamento - a.pctEsgotamento);

  return {
    pessoas: pessoasResult,
    sustentacoes: sustentacoesResult,
    projetosFechados: projetosFechadosResult,
  };
}

// ─────────────────────────────────────────────────────────
//  Alertas heurísticos (H1–H15)
// ─────────────────────────────────────────────────────────

export function computeHeuristicAlerts(
  tasks: Task[],
  clientes: Cliente[],
  projetos: Projeto[],
  pessoas: Pessoa[],
  today?: string,
): HeuristicAlert[] {
  const out: HeuristicAlert[] = [];
  const todayRef = today ?? new Date().toISOString().slice(0, 10);
  const in10 = new Date(new Date(todayRef + 'T00:00:00').getTime() + 10 * 86400000)
    .toISOString()
    .slice(0, 10);

  const clientesById = new Map(clientes.map((c) => [c.id, c]));
  const pessoasById = new Map(pessoas.map((p) => [p.id, p]));
  const projetosById = new Map(projetos.map((p) => [p.id, p]));

  // Buckets por heurística
  const bGrandes: Task[] = [];
  const cargaPorPessoa = new Map<string, number>();
  const bAtrasEstr: Task[] = [];
  const cliCountAtrasEstr = new Map<string, number>();
  const bBloqLongos: Task[] = [];
  const bSlaIminente: Task[] = [];
  const bReabertas: Task[] = [];
  const bEstimFurada: Task[] = [];
  const bTriagem: (Task & { _failures: string[] })[] = [];

  for (const t of tasks) {
    if (t.status === STATUS.CONCLUIDO || t.arquivadoEm) continue;

    const sz = effTamanho(t);
    const isGrande = sz === 'grande' || sz === 'mini_projeto';

    // H1 · Grande sem início, prazo ≤10 dias
    if (isGrande && t.subetapa === 'backlog' && t.prazo && t.prazo >= todayRef && t.prazo <= in10) {
      bGrandes.push(t);
    }

    // H2 · Carga por pessoa
    if (t.pessoaId) {
      cargaPorPessoa.set(t.pessoaId, (cargaPorPessoa.get(t.pessoaId) ?? 0) + effEsforco(t));
    }

    // H3 · Atrasada em cliente estratégico
    if (atrasada(t, todayRef)) {
      const cli = clientesById.get(t.clienteId);
      if (cli?.tier === 'estrategico') {
        bAtrasEstr.push(t);
        cliCountAtrasEstr.set(t.clienteId, (cliCountAtrasEstr.get(t.clienteId) ?? 0) + 1);
      }
    }

    // H4 · Bloqueio aguardando cliente há +5 dias
    if (t.subetapa === 'bloqueado' && t.bloqueadoPor === 'cliente' && agingDays(t) >= 5) {
      bBloqLongos.push(t);
    }

    // H5 · SLA iminente
    const proj = projetosById.get(t.projetoId);
    if (proj?.slaEntregaDias && t.criadoEm) {
      const aging = (Date.now() - t.criadoEm) / 86400000;
      if (aging >= proj.slaEntregaDias * 0.8 && aging < proj.slaEntregaDias * 1.2) {
        bSlaIminente.push(t);
      }
    }


    // H7 · Reaberturas crônicas
    if ((t.reopenCount ?? 0) >= 2) bReabertas.push(t);

    // H9 · Estimativa furada
    if (t.tempoRealHoras != null && t.esforco > 0 && t.tempoRealHoras > t.esforco * 1.5) {
      bEstimFurada.push(t);
    }

    // H10 · Triagem represada
    const failures = triageFailures(t);
    if (failures.length > 0) bTriagem.push({ ...t, _failures: failures });
  }

  // H15 · Sobrecarga semanal por pessoa × semana
  const wca = computeWeeklyCapacityAnalysis(tasks, clientes, projetos, pessoas, todayRef);
  const overloadByWeek: { pessoaId: string; nome: string; pctCap: number }[][] = [[], [], [], []];
  for (const p of wca.pessoas) {
    p.weeks.forEach((wk, idx) => {
      if (wk.nivel === 'sobrecarga' || wk.nivel === 'pressao') {
        overloadByWeek[idx].push({ pessoaId: p.pessoaId, nome: p.nome, pctCap: wk.pctCap ?? 0 });
      }
    });
  }
  overloadByWeek.forEach((ps, idx) => {
    if (!ps.length) return;
    ps.sort((a, b) => b.pctCap - a.pctCap);
    out.push({
      severity: idx === 0 ? 'alta' : 'media',
      kind: 'sobrecarga-semana',
      titulo: `${ps.length} pessoa(s) acima da capacidade ${semanaLabel(idx)}`,
      detalhe:
        ps
          .slice(0, 3)
          .map((p) => `${p.nome.split(' ')[0]} ${p.pctCap}%`)
          .join(' · ') + (ps.length > 3 ? ` · +${ps.length - 3}` : ''),
      pessoaIds: ps.map((p) => p.pessoaId),
      weekIdx: idx,
    });
  });

  // H11 · Sustentação estourando
  const sustEstourando = wca.sustentacoes.filter((s) => s.estourando);
  if (sustEstourando.length) {
    out.push({
      severity: 'alta',
      kind: 'sustentacao-estourando',
      titulo: `${sustEstourando.length} sustentação(ões) estourando contrato em alguma semana`,
      detalhe: sustEstourando
        .slice(0, 3)
        .map((s) => {
          const wk = s.weeks.findIndex((w) => (w.pctCap ?? 0) > 100);
          const cliNome = clientesById.get(s.clienteId)?.nome ?? '—';
          return `${cliNome} - ${s.nome} · ${semanaLabel(wk)} ${s.weeks[wk]?.pctCap}%`;
        })
        .join(' · '),
      projetoIds: sustEstourando.map((s) => s.projetoId),
    });
  }

  // H12 · Sustentação ociosa 2+ semanas
  const sustOciosa = wca.sustentacoes.filter((s) => s.ociosaFlag && !s.estourando);
  if (sustOciosa.length) {
    out.push({
      severity: 'media',
      kind: 'sustentacao-ociosa',
      titulo: `${sustOciosa.length} sustentação(ões) com capacidade ociosa por 2+ semanas`,
      detalhe: sustOciosa
        .slice(0, 3)
        .map((s) => `${clientesById.get(s.clienteId)?.nome ?? '—'} - ${s.nome}`)
        .join(' · '),
      projetoIds: sustOciosa.map((s) => s.projetoId),
    });
  }

  // H13 · Projeto fechado estourando escopo >110%
  const projEstourando = wca.projetosFechados.filter((p) => p.estourado);
  if (projEstourando.length) {
    out.push({
      severity: 'alta',
      kind: 'projeto-estourando-escopo',
      titulo: `${projEstourando.length} projeto(s) com escopo estourado (>110%)`,
      detalhe: projEstourando
        .slice(0, 3)
        .map((p) => `${clientesById.get(p.clienteId)?.nome ?? '—'} - ${p.nome} ${p.pctEsgotamento}%`)
        .join(' · '),
      projetoIds: projEstourando.map((p) => p.projetoId),
    });
  }

  // H14 · Projeto fechado em risco de estouro 90-110%
  const projRisco = wca.projetosFechados.filter((p) => p.risco);
  if (projRisco.length) {
    out.push({
      severity: 'media',
      kind: 'projeto-risco-estouro',
      titulo: `${projRisco.length} projeto(s) em risco de estourar escopo (90-110%)`,
      detalhe: projRisco
        .slice(0, 3)
        .map((p) => `${clientesById.get(p.clienteId)?.nome ?? '—'} - ${p.nome} ${p.pctEsgotamento}%`)
        .join(' · '),
      projetoIds: projRisco.map((p) => p.projetoId),
    });
  }

  // H3 (emit)
  if (bAtrasEstr.length) {
    const detalhe = Array.from(cliCountAtrasEstr.entries())
      .map(([cid, q]) => `${clientesById.get(cid)?.nome ?? cid}: ${q}`)
      .join(' · ');
    out.push({
      severity: 'alta',
      kind: 'tier-estrategico-atrasado',
      titulo: `${bAtrasEstr.length} tarefa(s) atrasada(s) em cliente(s) estratégico(s)`,
      detalhe,
      taskIds: bAtrasEstr.map((t) => t.id),
    });
  }

  if (bGrandes.length) {
    out.push({
      severity: 'alta',
      kind: 'grande-sem-inicio',
      titulo: `${bGrandes.length} tarefa(s) grande(s) sem início e prazo a ≤10 dias`,
      detalhe: 'Iniciar agora ou redimensionar. Tarefas grandes/mini-projeto demandam buffer.',
      taskIds: bGrandes.map((t) => t.id),
    });
  }
  if (bBloqLongos.length) {
    out.push({
      severity: 'media',
      kind: 'bloqueio-cliente-longo',
      titulo: `${bBloqLongos.length} tarefa(s) aguardando cliente há +5 dias`,
      detalhe: 'Escalação direta com sponsor recomendada.',
      taskIds: bBloqLongos.map((t) => t.id),
    });
  }
  if (bSlaIminente.length) {
    out.push({
      severity: 'media',
      kind: 'sla-iminente',
      titulo: `${bSlaIminente.length} tarefa(s) próximas do SLA contratado`,
      detalhe: 'Verificar entrega em projetos com SLA configurado.',
      taskIds: bSlaIminente.map((t) => t.id),
    });
  }
  if (bReabertas.length) {
    out.push({
      severity: 'media',
      kind: 'reaberturas-cronicas',
      titulo: `${bReabertas.length} tarefa(s) reabertas 2+ vezes`,
      detalhe: 'Investigar critério de "concluído" ou qualidade de entrega.',
      taskIds: bReabertas.map((t) => t.id),
    });
  }
  if (bEstimFurada.length) {
    out.push({
      severity: 'media',
      kind: 'estimativa-furada',
      titulo: `${bEstimFurada.length} tarefa(s) com tempo real >1.5x do estimado`,
      detalhe: 'Calibrar estimativa pra próxima similar; entender o gap.',
      taskIds: bEstimFurada.map((t) => t.id),
    });
  }
  if (bTriagem.length) {
    const counters: Record<string, number> = {};
    for (const t of bTriagem) for (const f of t._failures) counters[f] = (counters[f] ?? 0) + 1;
    const detalhe = Object.entries(counters)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${k}`)
      .join(' · ');
    out.push({
      severity: bTriagem.length >= 10 ? 'alta' : 'media',
      kind: 'triagem-represada',
      titulo: `${bTriagem.length} tarefa(s) precisando de triagem`,
      detalhe,
      taskIds: bTriagem.map((t) => t.id),
    });
  }

  const sevRank: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
  out.sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9));
  return out;
}

// ─────────────────────────────────────────────────────────
//  Velocidade da operação (30d)
// ─────────────────────────────────────────────────────────

export interface VelocidadeMetrics {
  /** Tasks concluídas NESTA semana (segunda passada → próxima segunda) */
  throughputW0: number;
  /** Projeção de W-0: throughputW0 + (tasks abertas com prazo nesta sem × pctNoPrazo).
   *  null se pctNoPrazo for null (sem histórico pra taxa). */
  throughputW0Projected: number | null;
  /** Tendência da projeção vs W-1: 'up' se proj >= W1, 'down' se menor, 'neutral' se =. null se projeção null */
  throughputW0Trend: 'up' | 'down' | 'neutral' | null;
  /** Tasks ainda abertas com prazo nesta semana (usado pra UI explicar a projeção) */
  abertasComPrazoNaSemana: number;
  throughputW1: number;
  throughputW2: number;
  /** Avg days criadoEm → concluído, last 30d. null se sem dados. */
  leadTimeDias: number | null;
  /** Avg days andamento→concluído (andamentoEm→statusEm), last 30d. null se sem dados. */
  cycleDias: number | null;
  /** Mesmo cálculo aplicado ao período 60d-30d atrás (pra delta de evolução) */
  cycleDiasPrev: number | null;
  /** % tasks com prazo concluídas no prazo, last 30d. null se nenhuma com prazo. */
  pctNoPrazo: number | null;
  /** Denominador do pctNoPrazo (tasks com prazo concluídas em 30d). */
  pctNoPrazoBases: number;
  /** Numerador (entregues no prazo). */
  pctNoPrazoOk: number;
  /** % no prazo do período 60d-30d atrás (pra delta de evolução) */
  pctNoPrazoPrev: number | null;
}

export function computeVelocidade(tasks: Task[]): VelocidadeMetrics {
  const now = Date.now();
  const d30ago = now - 30 * 24 * 3600 * 1000;
  const d60ago = now - 60 * 24 * 3600 * 1000;

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const offsetSeg = (todayDate.getDay() + 6) % 7;
  const thisMonday = new Date(todayDate);
  thisMonday.setDate(todayDate.getDate() - offsetSeg);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const prevMonday = new Date(lastMonday);
  prevMonday.setDate(lastMonday.getDate() - 7);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);

  const concluded = tasks.filter((t) => t.status === STATUS.CONCLUIDO && t.statusEm);

  const throughputW0 = concluded.filter(
    (t) => t.statusEm >= thisMonday.getTime() && t.statusEm < nextMonday.getTime(),
  ).length;
  const throughputW1 = concluded.filter(
    (t) => t.statusEm >= lastMonday.getTime() && t.statusEm < thisMonday.getTime(),
  ).length;
  const throughputW2 = concluded.filter(
    (t) => t.statusEm >= prevMonday.getTime() && t.statusEm < lastMonday.getTime(),
  ).length;

  const concluded30d = concluded.filter((t) => t.statusEm >= d30ago);

  const withDates = concluded30d.filter((t) => t.criadoEm);
  const leadTimeDias =
    withDates.length > 0
      ? Math.round(
          (10 * withDates.reduce((s, t) => s + (t.statusEm - t.criadoEm) / 86400000, 0)) /
            withDates.length,
        ) / 10
      : null;

  // Cycle time: uses andamentoEm (set when task enters andamento, not overwritten on conclude).
  const withCycle = concluded30d.filter((t) => t.andamentoEm > 0 && t.andamentoEm < t.statusEm);
  const cycleDias =
    withCycle.length > 0
      ? Math.round(
          (10 * withCycle.reduce((s, t) => s + (t.statusEm - t.andamentoEm) / 86400000, 0)) /
            withCycle.length,
        ) / 10
      : null;

  const comPrazo = concluded30d.filter((t) => t.prazo);
  const emPrazo = comPrazo.filter((t) => {
    const prazoMs = new Date(t.prazo).getTime() + 86400000;
    return t.statusEm <= prazoMs;
  });
  const pctNoPrazo =
    comPrazo.length > 0 ? Math.round((emPrazo.length / comPrazo.length) * 100) : null;

  // ===== Período anterior (60d → 30d atrás) — pra delta de evolução =====
  const concludedPrev30d = concluded.filter((t) => t.statusEm >= d60ago && t.statusEm < d30ago);
  const withCyclePrev = concludedPrev30d.filter((t) => t.andamentoEm > 0 && t.andamentoEm < t.statusEm);
  const cycleDiasPrev =
    withCyclePrev.length > 0
      ? Math.round(
          (10 * withCyclePrev.reduce((s, t) => s + (t.statusEm - t.andamentoEm) / 86400000, 0)) /
            withCyclePrev.length,
        ) / 10
      : null;
  const comPrazoPrev = concludedPrev30d.filter((t) => t.prazo);
  const emPrazoPrev = comPrazoPrev.filter((t) => {
    const prazoMs = new Date(t.prazo).getTime() + 86400000;
    return t.statusEm <= prazoMs;
  });
  const pctNoPrazoPrev =
    comPrazoPrev.length > 0 ? Math.round((emPrazoPrev.length / comPrazoPrev.length) * 100) : null;

  // ===== Projeção W-0 =====
  // Tasks ainda ABERTAS com prazo nesta semana — vão competir pra conclusão
  // até sexta. Aplicamos a taxa histórica de % no prazo pra estimar quantas
  // realmente serão concluídas. Soma com o throughput já realizado da
  // semana pra projeção total.
  const abertasComPrazoNaSemana = tasks.filter((t) => {
    if (t.arquivadoEm) return false;
    if (t.status === STATUS.CONCLUIDO) return false;
    if (!t.prazo) return false;
    const prazoMs = new Date(t.prazo).getTime();
    return prazoMs >= thisMonday.getTime() && prazoMs < nextMonday.getTime();
  }).length;

  const throughputW0Projected: number | null = pctNoPrazo != null
    ? throughputW0 + Math.round(abertasComPrazoNaSemana * (pctNoPrazo / 100))
    : null;

  const throughputW0Trend: 'up' | 'down' | 'neutral' | null =
    throughputW0Projected == null ? null
    : throughputW0Projected > throughputW1 ? 'up'
    : throughputW0Projected < throughputW1 ? 'down'
    : 'neutral';

  return {
    throughputW0,
    throughputW0Projected,
    throughputW0Trend,
    abertasComPrazoNaSemana,
    throughputW1,
    throughputW2,
    leadTimeDias,
    cycleDias,
    cycleDiasPrev,
    pctNoPrazo,
    pctNoPrazoBases: comPrazo.length,
    pctNoPrazoOk: emPrazo.length,
    pctNoPrazoPrev,
  };
}

// ─────────────────────────────────────────────────────────
//  Semáforo de projetos (saúde operacional)
// ─────────────────────────────────────────────────────────

type SinalProjeto = 'verde' | 'amarelo' | 'vermelho';

export interface ProjetoSaude {
  projetoId: string;
  nome: string;
  clienteId: string;
  nomeCliente: string;
  sinal: SinalProjeto;
  /** Texto opcional explicando o motivo da cor (ex: "3 atrasadas · 2 bloq.") */
  motivo: string;
  /** Tasks abertas no projeto */
  nAbertas: number;
  /** Subconjunto: prazo < hoje */
  nAtrasadas: number;
  /** Subconjunto: subetapa='bloqueado' (qualquer motivo) */
  nBloqueadas: number;
}

/**
 * Saúde por projeto · anatomia alinhada com PessoaSaude (jun/2026):
 *   3 métricas (abertas · atrasadas · bloqueadas) + sinal:
 *   - vermelho: nAtrasadas > 0
 *   - amarelo:  nBloqueadas > 0
 *   - verde:    nenhum dos dois
 */
export function computeProjetosSaude(
  tasks: Task[],
  projetos: Projeto[],
  clientes: Cliente[],
): ProjetoSaude[] {
  const clientesById = new Map(clientes.map((c) => [c.id, c]));
  const todayStr = new Date().toISOString().slice(0, 10);
  const abertas = tasks.filter((t) => t.status !== STATUS.CONCLUIDO && !t.arquivadoEm);

  const result: ProjetoSaude[] = [];
  for (const proj of projetos) {
    if (proj.arquivadoEm) continue;
    const projTasks = abertas.filter((t) => t.projetoId === proj.id);
    if (!projTasks.length) continue;

    const nAbertas = projTasks.length;
    const nAtrasadas = projTasks.filter((t) => t.prazo && t.prazo < todayStr).length;
    const nBloqueadas = projTasks.filter((t) => t.subetapa === 'bloqueado').length;

    const sinal: SinalProjeto =
      nAtrasadas > 0 ? 'vermelho' :
      nBloqueadas > 0 ? 'amarelo' : 'verde';

    const motivo =
      nAtrasadas > 0 && nBloqueadas > 0 ? `${nAtrasadas} atras. · ${nBloqueadas} bloq.`
      : nAtrasadas > 0 ? `${nAtrasadas} atrasada(s)`
      : nBloqueadas > 0 ? `${nBloqueadas} bloqueada(s)`
      : 'Saudável';

    result.push({
      projetoId: proj.id,
      nome: proj.nome,
      clienteId: proj.clienteId,
      nomeCliente: clientesById.get(proj.clienteId)?.nome ?? '—',
      sinal,
      motivo,
      nAbertas,
      nAtrasadas,
      nBloqueadas,
    });
  }

  const order: Record<SinalProjeto, number> = { vermelho: 0, amarelo: 1, verde: 2 };
  result.sort((a, b) => order[a.sinal] - order[b.sinal]);
  return result;
}

// ─────────────────────────────────────────────────────────
//  Entregas semana atual + 4 (horas abertas por prazo)
// ─────────────────────────────────────────────────────────

export interface EntregaSemana {
  label: string;
  hours: number;
  isAtrasada: boolean;
  isCurrent: boolean;
}

export function computeEntregasSemanas(tasks: Task[], today?: string): EntregaSemana[] {
  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  const todayDate = new Date(todayStr + 'T00:00:00');
  const offsetSeg = (todayDate.getDay() + 6) % 7;
  const monday = new Date(todayDate);
  monday.setDate(todayDate.getDate() - offsetSeg);

  const abertas = tasks.filter((t) => t.status !== STATUS.CONCLUIDO && !t.arquivadoEm);

  const result: EntregaSemana[] = [];
  const horasAtras = abertas
    .filter((t) => t.prazo && t.prazo < todayStr)
    .reduce((s, t) => s + effEsforco(t), 0);
  result.push({ label: 'Atrasadas', hours: horasAtras, isAtrasada: true, isCurrent: false });

  for (let i = 0; i <= 4; i++) {
    const wStart = new Date(monday);
    wStart.setDate(monday.getDate() + i * 7);
    const wEnd = new Date(wStart);
    wEnd.setDate(wStart.getDate() + 7);
    const wStartStr = wStart.toISOString().slice(0, 10);
    const wEndStr = wEnd.toISOString().slice(0, 10);
    const hours = abertas
      .filter((t) => t.prazo && t.prazo >= wStartStr && t.prazo < wEndStr)
      .reduce((s, t) => s + effEsforco(t), 0);
    const label = wStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    result.push({ label, hours, isAtrasada: false, isCurrent: i === 0 });
  }
  return result;
}

// ─────────────────────────────────────────────────────────
//  Calendário de entregas (semana passada + atual + 4)
// ─────────────────────────────────────────────────────────

export interface CalDia {
  date: string;
  count: number;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
}

export function computeCalendario(tasks: Task[], today?: string): CalDia[] {
  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  const todayDate = new Date(todayStr + 'T00:00:00');
  const offsetSeg = (todayDate.getDay() + 6) % 7;
  const currentMonday = new Date(todayDate);
  currentMonday.setDate(todayDate.getDate() - offsetSeg);

  const startDate = new Date(currentMonday);
  startDate.setDate(currentMonday.getDate() - 7); // semana passada

  const endDate = new Date(currentMonday);
  endDate.setDate(currentMonday.getDate() + 5 * 7); // +4 semanas (6 semanas total)

  const abertas = tasks.filter((t) => t.status !== STATUS.CONCLUIDO && !t.arquivadoEm);
  const countByDay = new Map<string, number>();
  for (const t of abertas) {
    if (!t.prazo) continue;
    countByDay.set(t.prazo, (countByDay.get(t.prazo) ?? 0) + 1);
  }

  const result: CalDia[] = [];
  const cur = new Date(startDate);
  while (cur < endDate) {
    const dateStr = cur.toISOString().slice(0, 10);
    const dow = cur.getDay();
    result.push({
      date: dateStr,
      count: countByDay.get(dateStr) ?? 0,
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
      isWeekend: dow === 0 || dow === 6,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// ─────────────────────────────────────────────────────────
//  Volume por cliente (contagem de tasks abertas)
// ─────────────────────────────────────────────────────────

export interface VolumeCliente {
  clienteId: string;
  nome: string;
  count: number;
  nAtrasadas: number;
}

export function computeVolumeByCliente(tasks: Task[], clientes: Cliente[]): VolumeCliente[] {
  const abertas = tasks.filter((t) => t.status !== STATUS.CONCLUIDO && !t.arquivadoEm);
  const countMap = new Map<string, number>();
  const atrasMap = new Map<string, number>();
  for (const t of abertas) {
    if (!t.clienteId) continue;
    countMap.set(t.clienteId, (countMap.get(t.clienteId) ?? 0) + 1);
    if (atrasada(t)) {
      atrasMap.set(t.clienteId, (atrasMap.get(t.clienteId) ?? 0) + 1);
    }
  }
  const clientesById = new Map(clientes.map((c) => [c.id, c]));
  const result: VolumeCliente[] = [];
  for (const [clienteId, count] of countMap) {
    const c = clientesById.get(clienteId);
    if (!c || c.arquivadoEm) continue;
    result.push({ clienteId, nome: c.nome, count, nAtrasadas: atrasMap.get(clienteId) ?? 0 });
  }
  result.sort((a, b) => b.count - a.count);
  return result;
}

// ─────────────────────────────────────────────────────────
//  Carga por pessoa (contagem, split tasks atrasadas)
// ─────────────────────────────────────────────────────────

export interface VolumePessoa {
  pessoaId: string;
  nome: string;
  /** Contagem de tasks abertas atribuídas */
  total: number;
  /** Quantas dessas tasks estão atrasadas (prazo < hoje) */
  nAtrasadas: number;
}

/**
 * Volume de tasks por pessoa (count). Renderiza no Dashboard simétrico
 * ao "Volume por cliente". Alocação em HORAS por pessoa fica no Briefing
 * via `computeWeeklyCapacityAnalysis` (que usa effRemaining e capacidade
 * semanal).
 * - Filtros: exclui pessoas com role=cliente e is_pm=true.
 * - Privadas do CEO entram naturalmente quando o viewer é o CEO (RLS libera).
 */
export function computeCargaByPessoa(tasks: Task[], pessoas: Pessoa[]): VolumePessoa[] {
  const todayStr = new Date().toISOString().slice(0, 10);
  const abertas = tasks.filter((t) => t.status !== STATUS.CONCLUIDO && !t.arquivadoEm);
  const totalMap = new Map<string, number>();
  const atrasMap = new Map<string, number>();
  for (const t of abertas) {
    if (!t.pessoaId) continue;
    totalMap.set(t.pessoaId, (totalMap.get(t.pessoaId) ?? 0) + 1);
    if (t.prazo && t.prazo < todayStr) {
      atrasMap.set(t.pessoaId, (atrasMap.get(t.pessoaId) ?? 0) + 1);
    }
  }
  const pessoasById = new Map(pessoas.map((p) => [p.id, p]));
  const result: VolumePessoa[] = [];
  for (const [pessoaId, total] of totalMap) {
    const p = pessoasById.get(pessoaId);
    if (!p || p.role === 'cliente' || p.is_pm) continue;
    result.push({
      pessoaId,
      nome: p.nome,
      total,
      nAtrasadas: atrasMap.get(pessoaId) ?? 0,
    });
  }
  result.sort((a, b) => b.total - a.total);
  return result;
}


// ─────────────────────────────────────────────────────────
//  Saúde por pessoa
// ─────────────────────────────────────────────────────────

export interface PessoaSaude {
  pessoaId: string;
  nome: string;
  sinal: 'verde' | 'amarelo' | 'vermelho';
  /** Tasks abertas atribuídas (count) */
  nAbertas: number;
  /** Subconjunto: tasks com prazo < hoje */
  nAtrasadas: number;
  /** Subconjunto: tasks com subetapa='bloqueado' (qualquer motivo: aguard. cliente OU interno) */
  nBloqueadas: number;
  /** Soma horas remanescentes (effRemaining) das abertas */
  totalHoras: number;
}

/**
 * Saúde por pessoa simplificada (jun/2026):
 * - 3 métricas: abertas · atrasadas · bloqueadas (sem aguard./parada como
 *   buckets separados — confundiam mais do que ajudavam).
 * - Sinal: vermelho se atrasadas>0 · amarelo se bloqueadas>0 · verde caso contrário.
 * - Filtros: exclui clientes e PMs (is_pm=true).
 */
export function computeSaudePorPessoa(tasks: Task[], pessoas: Pessoa[], today?: string): PessoaSaude[] {
  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  const abertas = tasks.filter((t) => t.status !== STATUS.CONCLUIDO && !t.arquivadoEm);

  const byPessoa = new Map<string, Task[]>();
  for (const t of abertas) {
    if (!t.pessoaId) continue;
    const arr = byPessoa.get(t.pessoaId) ?? [];
    arr.push(t);
    byPessoa.set(t.pessoaId, arr);
  }

  const pessoasById = new Map(pessoas.map((p) => [p.id, p]));
  const result: PessoaSaude[] = [];

  for (const [pessoaId, ptasks] of byPessoa) {
    const p = pessoasById.get(pessoaId);
    if (!p || p.role === 'cliente' || p.is_pm) continue;
    const nAtrasadas = ptasks.filter((t) => t.prazo && t.prazo < todayStr).length;
    const nBloqueadas = ptasks.filter((t) => t.subetapa === 'bloqueado').length;
    const totalHoras = Math.round(ptasks.reduce((s, t) => s + effRemaining(t), 0) * 10) / 10;

    const sinal: 'verde' | 'amarelo' | 'vermelho' =
      nAtrasadas > 0 ? 'vermelho' :
      nBloqueadas > 0 ? 'amarelo' : 'verde';

    result.push({
      pessoaId, nome: p.nome, sinal,
      nAbertas: ptasks.length, nAtrasadas, nBloqueadas, totalHoras,
    });
  }

  const order: Record<string, number> = { vermelho: 0, amarelo: 1, verde: 2 };
  result.sort((a, b) => order[a.sinal] - order[b.sinal]);
  return result;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Arredonda pra baixo, ignorando timezone — suficiente pra analytics. */
function daysBetween(msA: number, msB: number): number {
  return Math.floor(Math.abs(msB - msA) / DAY_MS);
}

/** Percentil de um array já ordenado (ascendente). */
function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/** Converte 'YYYY-MM-DD' no fim do dia UTC (23:59:59.999). */
function prazoEndOfDay(iso: string): number {
  return new Date(iso + 'T23:59:59.999Z').getTime();
}

// ─── C.8 · SLA Breach Rate ──────────────────────────────────────────────────

type SLAStats = {
  total: number;
  breached: number;
  /** 0-1 */
  rate: number;
};

export type SLABreachResult = {
  overall: SLAStats;
  byCliente: Map<string, SLAStats>;
  byProjeto: Map<string, SLAStats>;
  byPessoa: Map<string, SLAStats>;
};

function emptyStats(): SLAStats {
  return { total: 0, breached: 0, rate: 0 };
}

function bumpStats(map: Map<string, SLAStats>, key: string, breached: boolean) {
  if (!key) return;
  if (!map.has(key)) map.set(key, emptyStats());
  const s = map.get(key)!;
  s.total++;
  if (breached) s.breached++;
  s.rate = s.breached / s.total;
}

/**
 * Calcula taxa de breach de prazo para tasks concluídas.
 * "breach" = task concluída (statusEm) após o fim do dia do prazo.
 * Inclui tasks arquivadas (registro histórico).
 */
export function computeSLABreach(tasks: Task[]): SLABreachResult {
  const eligible = tasks.filter(
    (t) => t.status === STATUS.CONCLUIDO && t.prazo && t.statusEm > 0,
  );

  const byCliente = new Map<string, SLAStats>();
  const byProjeto = new Map<string, SLAStats>();
  const byPessoa  = new Map<string, SLAStats>();
  const overall   = emptyStats();

  for (const t of eligible) {
    const breached = t.statusEm > prazoEndOfDay(t.prazo);
    overall.total++;
    if (breached) overall.breached++;
    bumpStats(byCliente, t.clienteId, breached);
    bumpStats(byProjeto, t.projetoId, breached);
    bumpStats(byPessoa,  t.pessoaId,  breached);
  }
  if (overall.total > 0) overall.rate = overall.breached / overall.total;

  return { overall, byCliente, byProjeto, byPessoa };
}

// ─── C.3 · Skill mismatch ───────────────────────────────────────────────────

export type SkillMismatch = {
  taskId: string;
  taskTitulo: string;
  clienteId: string;
  projetoId: string;
  pessoaId: string;
  taskEscopo: string[];
  /** Skills do escopo da task que a pessoa NÃO tem. */
  missingSkills: string[];
};

/**
 * Retorna tasks abertas onde a pessoa atribuída não tem nenhuma das
 * skills do escopo da task (interseção vazia).
 */
export function computeSkillMismatches(
  tasks: Task[],
  pessoasById: Map<string, Pessoa>,
): SkillMismatch[] {
  const result: SkillMismatch[] = [];
  for (const t of tasks) {
    if (t.arquivadoEm) continue;
    if (t.status === STATUS.CONCLUIDO) continue;
    if (!t.pessoaId) continue;
    const escopo = t.escopo ?? [];
    if (escopo.length === 0) continue;

    const pessoa = pessoasById.get(t.pessoaId);
    if (!pessoa) continue;
    const skills = pessoa.skills ?? [];
    const missing = escopo.filter((s) => !skills.includes(s));
    if (missing.length === 0) continue;

    result.push({
      taskId: t.id,
      taskTitulo: t.titulo,
      clienteId: t.clienteId,
      projetoId: t.projetoId,
      pessoaId: t.pessoaId,
      taskEscopo: escopo,
      missingSkills: missing,
    });
  }
  return result;
}

// ─── C.4 · Senioridade malalocada ───────────────────────────────────────────

type SenioridadeAlertType = 'risco_qualidade' | 'desperdicio';

export type SenioridadeAlert = {
  taskId: string;
  taskTitulo: string;
  clienteId: string;
  pessoaId: string;
  /** risco_qualidade: complexidade alta + júnior. desperdicio: baixa + sênior. */
  type: SenioridadeAlertType;
  complexidade: string;
  senioridade: string;
};

/**
 * Detecta tasks abertas com mismatch de senioridade:
 * - risco_qualidade: complexidade='alta' atribuída a 'junior'
 * - desperdicio:     complexidade='baixa' atribuída a 'senior'
 */
export function computeSenioridadeAlerts(
  tasks: Task[],
  pessoasById: Map<string, Pessoa>,
): SenioridadeAlert[] {
  const result: SenioridadeAlert[] = [];
  for (const t of tasks) {
    if (t.arquivadoEm) continue;
    if (t.status === STATUS.CONCLUIDO) continue;
    if (!t.pessoaId || !t.complexidade) continue;

    const pessoa = pessoasById.get(t.pessoaId);
    if (!pessoa?.senioridade) continue;

    const c = t.complexidade;
    const s = pessoa.senioridade.toLowerCase();
    let type: SenioridadeAlertType | null = null;
    if (c === 'alta' && s === 'junior') type = 'risco_qualidade';
    else if (c === 'baixa' && s === 'senior') type = 'desperdicio';
    if (!type) continue;

    result.push({
      taskId: t.id,
      taskTitulo: t.titulo,
      clienteId: t.clienteId,
      pessoaId: t.pessoaId,
      type,
      complexidade: c,
      senioridade: s,
    });
  }
  return result;
}

// ─── C.7 · Bottleneck por sub-etapa ─────────────────────────────────────────

export type SubetapaStats = {
  subetapa: string;
  count: number;
  /** Dias medianos na sub-etapa atual. */
  mediana: number;
  p75: number;
  p90: number;
};

/**
 * Para cada sub-etapa, calcula a distribuição de tempo (em dias) que
 * tasks abertas estão paradas nela. Usa `subetapaEm` (timestamp da
 * última mudança de sub-etapa) como referência.
 *
 * Não cobre histórico (task_status_history foi dropada no cutover) —
 * mede apenas a etapa *corrente* de cada task aberta.
 */
export function computeBottlenecks(tasks: Task[], now = Date.now()): SubetapaStats[] {
  const bySubetapa = new Map<string, number[]>();

  for (const t of tasks) {
    if (t.arquivadoEm) continue;
    if (t.status === STATUS.CONCLUIDO) continue;
    if (!t.subetapaEm) continue;

    const days = daysBetween(t.subetapaEm, now);
    if (!bySubetapa.has(t.subetapa)) bySubetapa.set(t.subetapa, []);
    bySubetapa.get(t.subetapa)!.push(days);
  }

  return Array.from(bySubetapa.entries()).map(([subetapa, days]) => {
    const sorted = [...days].sort((a, b) => a - b);
    return {
      subetapa,
      count: sorted.length,
      mediana: pct(sorted, 50),
      p75:     pct(sorted, 75),
      p90:     pct(sorted, 90),
    };
  });
}

// ─── C.5 · Churn risk por cliente ───────────────────────────────────────────

type ChurnRiskLevel = 'ok' | 'atencao' | 'critico';

type ClienteChurnSignals = {
  /** Tasks com subetapa='bloqueado' há mais de 14 dias. */
  tasksBloquadas14d: number;
  /** Dias desde a última task concluída (null = nenhuma concluída ainda). */
  diasSemEntrega: number | null;
  /** Taxa de breach de prazo (0-1) calculada inline. */
  slaBreachRate: number;
  /** Tasks travadas em em_definicao há mais de 21 dias. */
  tasksEmDefinicao21d: number;
};

export type ClienteChurnRisk = {
  clienteId: string;
  /** 0-100. */
  score: number;
  level: ChurnRiskLevel;
  sinais: ClienteChurnSignals;
};

/**
 * Score composto de risco de churn por cliente externo.
 * Clientes internos (ehInterno=true) são excluídos automaticamente.
 * Só retorna clientes com score > 0 (pelo menos um sinal disparado).
 *
 * Pontuação:
 *   +25  task bloqueada há > 14d
 *   +30  sem entrega há > 30d
 *   +25  SLA breach > 40%
 *   +20  task em_definicao há > 21d
 */
export function computeChurnRisk(
  tasks: Task[],
  clientes: Cliente[],
  now = Date.now(),
): ClienteChurnRisk[] {
  const internalIds = new Set(clientes.filter((c) => c.ehInterno).map((c) => c.id));
  const externalIds = [...new Set(
    tasks
      .filter((t) => !t.arquivadoEm && t.clienteId && !internalIds.has(t.clienteId))
      .map((t) => t.clienteId),
  )];

  return externalIds
    .map((clienteId) => {
      const ct = tasks.filter((t) => t.clienteId === clienteId && !t.arquivadoEm);

      const tasksBloquadas14d = ct.filter(
        (t) => t.subetapa === 'bloqueado' && t.subetapaEm && daysBetween(t.subetapaEm, now) > 14,
      ).length;

      const concluidas = ct.filter((t) => t.status === STATUS.CONCLUIDO && t.statusEm > 0);
      const diasSemEntrega =
        concluidas.length > 0
          ? daysBetween(Math.max(...concluidas.map((t) => t.statusEm)), now)
          : null;

      // SLA breach inline (só tasks com prazo)
      const comPrazo = ct.filter((t) => t.status === STATUS.CONCLUIDO && t.prazo && t.statusEm > 0);
      const breached  = comPrazo.filter((t) => t.statusEm > prazoEndOfDay(t.prazo)).length;
      const slaBreachRate = comPrazo.length > 0 ? breached / comPrazo.length : 0;

      const tasksEmDefinicao21d = ct.filter(
        (t) =>
          t.subetapa === 'em_definicao' &&
          t.subetapaEm &&
          daysBetween(t.subetapaEm, now) > 21,
      ).length;

      let score = 0;
      if (tasksBloquadas14d > 0) score += 25;
      if (diasSemEntrega !== null && diasSemEntrega > 30) score += 30;
      if (slaBreachRate > 0.4) score += 25;
      if (tasksEmDefinicao21d > 0) score += 20;
      score = Math.min(100, score);

      const level: ChurnRiskLevel =
        score >= 70 ? 'critico' : score >= 40 ? 'atencao' : 'ok';

      return {
        clienteId,
        score,
        level,
        sinais: { tasksBloquadas14d, diasSemEntrega, slaBreachRate, tasksEmDefinicao21d },
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ─── C.2 · Capacidade prevista ───────────────────────────────────────────────

type CapacidadeNivel = 'ok' | 'atencao' | 'critico';

type CapacidadePessoa = {
  pessoaId: string;
  /** Tasks concluídas nas últimas 4 semanas / 4. */
  throughput_semana: number;
  backlog_aberto: number;
  /** Semanas para esgotamento da capacidade. Infinity = sem entregas recentes. */
  semanas_estouro: number;
  nivel: CapacidadeNivel;
};

export type CapacidadeResult = {
  throughput_semana: number;
  backlog_aberto: number;
  semanas_estouro: number;
  nivel: CapacidadeNivel;
  /** Por pessoa atribuída (exclui pessoas sem tasks abertas). */
  byPessoa: CapacidadePessoa[];
};

function capNivel(semanas: number): CapacidadeNivel {
  if (!isFinite(semanas) || semanas > 8) return 'critico';
  if (semanas > 4) return 'atencao';
  return 'ok';
}

/**
 * Projeta em quantas semanas o backlog atual esgota a capacidade do time,
 * usando throughput médio das últimas 4 semanas como proxy de velocidade.
 *
 * Thresholds:
 *   ok       ≤ 4 semanas
 *   atencao  > 4 e ≤ 8 semanas
 *   critico  > 8 semanas (ou sem throughput recente)
 */
export function computeCapacidade(tasks: Task[], now = Date.now()): CapacidadeResult {
  const cutoff4w = now - 4 * 7 * DAY_MS;

  const concluidas4w = tasks.filter(
    (t) => t.status === STATUS.CONCLUIDO && t.statusEm >= cutoff4w,
  );
  const abertas = tasks.filter(
    (t) => !t.arquivadoEm && t.status !== STATUS.CONCLUIDO,
  );

  const throughput_semana = concluidas4w.length / 4;
  const backlog_aberto    = abertas.length;
  const semanas_estouro   = throughput_semana > 0 ? backlog_aberto / throughput_semana : Infinity;

  const pessoaIds = [...new Set(abertas.map((t) => t.pessoaId).filter(Boolean))];
  const byPessoa: CapacidadePessoa[] = pessoaIds.map((pessoaId) => {
    const tp = concluidas4w.filter((t) => t.pessoaId === pessoaId).length / 4;
    const bl = abertas.filter((t) => t.pessoaId === pessoaId).length;
    const se = tp > 0 ? bl / tp : Infinity;
    return { pessoaId, throughput_semana: tp, backlog_aberto: bl, semanas_estouro: se, nivel: capNivel(se) };
  });

  return {
    throughput_semana,
    backlog_aberto,
    semanas_estouro,
    nivel: capNivel(semanas_estouro),
    byPessoa,
  };
}
