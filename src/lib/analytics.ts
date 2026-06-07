/**
 * analytics.ts — heurísticas puras de saúde operacional
 *
 * C.2  Capacidade prevista (throughput vs backlog)
 * C.3  Skill mismatch (escopo da task vs skills da pessoa)
 * C.4  Senioridade malalocada (complexidade vs senioridade)
 * C.5  Churn risk por cliente (sinal composto)
 * C.7  Bottleneck por sub-etapa (tempo mediano em cada etapa)
 * C.8  SLA breach rate (por cliente / projeto / pessoa)
 *
 * Todas as funções são puras: recebem dados do store, retornam
 * resultados tipados. Nenhuma invoca rede ou LLM.
 */

import type { Task, Pessoa, Cliente } from '@/lib/types';
import { STATUS } from '@/lib/task-constants';

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

export type SLAStats = {
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

export type SenioridadeAlertType = 'risco_qualidade' | 'desperdicio';

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

export type ChurnRiskLevel = 'ok' | 'atencao' | 'critico';

export type ClienteChurnSignals = {
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

export type CapacidadeNivel = 'ok' | 'atencao' | 'critico';

export type CapacidadePessoa = {
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
