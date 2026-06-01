/**
 * Heurísticas de alerta operacional e análise de capacidade semanal.
 * Portado de lib/views/adoption.js (Alpine) e lib/views/briefing.js.
 *
 * Funções puras — recebem os arrays do DataProvider como parâmetros.
 * Sem dependência de DOM, React ou Supabase.
 */

import type { Cliente, Pessoa, Projeto, Task } from './types';
import { STATUS } from './task-constants';
import {
  agingDays,
  cargaNivelFromPctCap,
  effEsforco,
  effTamanho,
  atrasada,
  needsTriage,
  taskWeekIndex,
  triageFailures,
  type CargaNivel,
} from './task-utils';

// ─────────────────────────────────────────────────────────
//  Tipos
// ─────────────────────────────────────────────────────────

export type HeuristicSeverity = 'alta' | 'media' | 'baixa';

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

export interface WeekData {
  hours: number;
  pctCap: number | null;
  nivel: CargaNivel;
}

export interface PessoaCapacidade {
  pessoaId: string;
  nome: string;
  capacidade: number;
  weeks: [WeekData, WeekData, WeekData, WeekData];
  anyOverload: boolean;
}

export interface SustentacaoCapacidade {
  projetoId: string;
  nome: string;
  clienteId: string;
  capSemanal: number;
  orcMensal: number;
  weeks: [WeekData, WeekData, WeekData, WeekData];
  estourando: boolean;
  ociosaFlag: boolean;
}

export interface ProjetoFechadoCapacidade {
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
  const pessoaHours = new Map<string, [number, number, number, number]>();
  for (const p of pessoas) {
    if (p.role === 'cliente') continue;
    pessoaHours.set(p.id, [0, 0, 0, 0]);
  }
  for (const t of ativas) {
    if (!t.pessoaId) continue;
    const arr = pessoaHours.get(t.pessoaId);
    if (!arr) continue;
    const idx = taskWeekIndex(t, todayRef);
    if (idx === -1) arr[0] += effEsforco(t);
    else if (idx !== null) arr[idx] += effEsforco(t);
  }
  const pessoasResult: PessoaCapacidade[] = [];
  for (const p of pessoas) {
    if (p.role === 'cliente') continue;
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
    if (idx === -1) arr[0] += effEsforco(t);
    else if (idx !== null) arr[idx] += effEsforco(t);
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
  const in14 = new Date(new Date(todayRef + 'T00:00:00').getTime() + 14 * 86400000)
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
  const bJuniorComplex: Task[] = [];
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

    // H6 · Júnior com complexidade alta
    if (t.complexidade === 'alta' && t.pessoaId) {
      const p = pessoasById.get(t.pessoaId);
      if (p?.senioridade === 'junior') bJuniorComplex.push(t);
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
          return `${s.nome} · ${semanaLabel(wk)} ${s.weeks[wk]?.pctCap}%`;
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
        .map((s) => s.nome)
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
        .map((p) => `${p.nome} ${p.pctEsgotamento}%`)
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
        .map((p) => `${p.nome} ${p.pctEsgotamento}%`)
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
  if (bJuniorComplex.length) {
    out.push({
      severity: 'media',
      kind: 'junior-complexidade-alta',
      titulo: `${bJuniorComplex.length} tarefa(s) de complexidade alta atribuída(s) a júnior`,
      detalhe: 'Considerar par com sênior, mentoria ou redistribuição.',
      taskIds: bJuniorComplex.map((t) => t.id),
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
//  Throughput semanal (últimas 8 semanas)
// ─────────────────────────────────────────────────────────

export interface ThroughputWeek {
  label: string;   // 'DD/MM'
  count: number;
  isCurrent: boolean;
}

export function computeThroughput(tasks: Task[]): ThroughputWeek[] {
  const completed = tasks.filter((t) => t.status === STATUS.CONCLUIDO && t.statusEm);
  const out: ThroughputWeek[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const offsetSeg = (now.getDay() + 6) % 7; // segunda = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - offsetSeg);

  for (let i = 7; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const count = completed.filter((t) => {
      const d = new Date(t.statusEm);
      return d >= start && d < end;
    }).length;
    const label = start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    out.push({ label, count, isCurrent: i === 0 });
  }
  return out;
}

// ─────────────────────────────────────────────────────────
//  Velocidade da operação (30d)
// ─────────────────────────────────────────────────────────

export interface VelocidadeMetrics {
  throughputW1: number;
  throughputW2: number;
  /** Avg days criadoEm → concluído, last 30d. null se sem dados. */
  leadTimeDias: number | null;
  /** % tasks com prazo concluídas no prazo, last 30d. null se nenhuma com prazo. */
  pctNoPrazo: number | null;
  /** Denominador do pctNoPrazo (tasks com prazo concluídas em 30d). */
  pctNoPrazoBases: number;
  /** Numerador (entregues no prazo). */
  pctNoPrazoOk: number;
}

export function computeVelocidade(tasks: Task[]): VelocidadeMetrics {
  const now = Date.now();
  const d30ago = now - 30 * 24 * 3600 * 1000;

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const offsetSeg = (todayDate.getDay() + 6) % 7;
  const thisMonday = new Date(todayDate);
  thisMonday.setDate(todayDate.getDate() - offsetSeg);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const prevMonday = new Date(lastMonday);
  prevMonday.setDate(lastMonday.getDate() - 7);

  const concluded = tasks.filter((t) => t.status === STATUS.CONCLUIDO && t.statusEm);

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

  const comPrazo = concluded30d.filter((t) => t.prazo);
  const emPrazo = comPrazo.filter((t) => {
    const prazoMs = new Date(t.prazo).getTime() + 86400000;
    return t.statusEm <= prazoMs;
  });
  const pctNoPrazo =
    comPrazo.length > 0 ? Math.round((emPrazo.length / comPrazo.length) * 100) : null;

  return {
    throughputW1,
    throughputW2,
    leadTimeDias,
    pctNoPrazo,
    pctNoPrazoBases: comPrazo.length,
    pctNoPrazoOk: emPrazo.length,
  };
}

// ─────────────────────────────────────────────────────────
//  Semáforo de projetos (saúde operacional)
// ─────────────────────────────────────────────────────────

export type SinalProjeto = 'verde' | 'amarelo' | 'vermelho';

export interface ProjetoSaude {
  projetoId: string;
  nome: string;
  clienteId: string;
  nomeCliente: string;
  sinal: SinalProjeto;
  motivo: string;
  nAbertas: number;
  nAtrasadas: number;
}

export function computeProjetosSaude(
  tasks: Task[],
  projetos: Projeto[],
  clientes: Cliente[],
): ProjetoSaude[] {
  const clientesById = new Map(clientes.map((c) => [c.id, c]));
  const abertas = tasks.filter((t) => t.status !== STATUS.CONCLUIDO && !t.arquivadoEm);

  const result: ProjetoSaude[] = [];
  for (const proj of projetos) {
    if (proj.arquivadoEm) continue;
    const projTasks = abertas.filter((t) => t.projetoId === proj.id);
    if (!projTasks.length) continue;

    const nAbertas = projTasks.length;
    const atrasadas = projTasks.filter((t) => {
      if (!t.prazo) return false;
      return t.prazo < new Date().toISOString().slice(0, 10);
    });
    const nAtrasadas = atrasadas.length;

    const bloqCliente = projTasks.filter(
      (t) => t.subetapa === 'bloqueado' && t.bloqueadoPor === 'cliente' && agingDays(t) >= 5,
    );

    let sinal: SinalProjeto = 'verde';
    let motivo = 'Saudável';

    if (nAtrasadas > 0 || bloqCliente.length) {
      sinal = 'vermelho';
      if (nAtrasadas > 0 && bloqCliente.length) {
        motivo = `${nAtrasadas} atrasada(s) · ${bloqCliente.length} bloq. cliente`;
      } else if (nAtrasadas > 0) {
        motivo = `${nAtrasadas} tarefa(s) atrasada(s)`;
      } else {
        motivo = `${bloqCliente.length} aguardando cliente +5d`;
      }
    } else {
      const bloqInterno = projTasks.filter(
        (t) => t.status === 'bloqueado' || (t.subetapa === 'bloqueado' && t.bloqueadoPor !== 'cliente'),
      );
      if (bloqInterno.length) {
        sinal = 'amarelo';
        motivo = `${bloqInterno.length} bloqueio(s) interno(s)`;
      }
    }

    result.push({
      projetoId: proj.id,
      nome: proj.nome,
      clienteId: proj.clienteId,
      nomeCliente: clientesById.get(proj.clienteId)?.nome ?? '—',
      sinal,
      motivo,
      nAbertas,
      nAtrasadas,
    });
  }

  // vermelho primeiro, depois amarelo, verde
  const order: Record<SinalProjeto, number> = { vermelho: 0, amarelo: 1, verde: 2 };
  result.sort((a, b) => order[a.sinal] - order[b.sinal]);
  return result;
}

// Re-exporta needsTriage para conveniência dos componentes
export { needsTriage };
