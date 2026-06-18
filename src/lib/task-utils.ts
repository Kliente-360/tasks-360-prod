/**
 * Helpers puros de task — portados de lib/helpers.js do app atual.
 * Operam sobre o tipo in-memory `Task` (camelCase, prazo ISO 'YYYY-MM-DD',
 * statusEm em epoch ms). Sem dependência de DOM, React ou Supabase.
 */

import type { Task } from './types';
import { STATUS, STAGE_RANK } from './task-constants';

/** Esforço efetivo: usa o declarado, ou 4h como fallback se zero/null. */
export function effEsforco(t: Pick<Task, 'esforco'>): number {
  const e = Number(t.esforco) || 0;
  return e > 0 ? e : 4;
}

/**
 * Esforço REMANESCENTE: effEsforco menos horas já registradas como
 * realizadas (campo manual `tempoRealHoras` no modal). Usado em cálculos
 * de capacidade e carga pra refletir o que ainda precisa de execução,
 * não o orçamento original. Mínimo zero (task estourada não conta como
 * "carga negativa").
 */
export function effRemaining(t: Pick<Task, 'esforco' | 'tempoRealHoras'>): number {
  const restante = effEsforco(t) - (Number(t.tempoRealHoras) || 0);
  return restante > 0 ? restante : 0;
}

/**
 * Task aguardando aceitação na Triagem (gate A.4 jun/2026):
 *  - Criada por IA E ainda não foi triada (aceita ou rejeitada).
 *  - Enquanto isPreTriagem=true, a task NÃO deve aparecer em
 *    Backlog/Foco/Kanban/Calendário/Dashboard. Só visível em Triagem.
 *  - Após aceitar (set triada_em) entra no fluxo normal.
 *  - Após rejeitar (set triada_em + arquivado_em + motivo_arquivamento)
 *    fica arquivada → some normalmente.
 */
export function isPreTriagem(t: Pick<Task, 'criadoPorIa' | 'triadaEm'>): boolean {
  return t.criadoPorIa === true && !t.triadaEm;
}

/** Tamanho de task baseado no effEsforco. */
export function effTamanho(t: Pick<Task, 'esforco'>): string {
  const h = effEsforco(t);
  if (h < 2) return 'mini';
  if (h < 8) return 'small';
  if (h < 24) return 'medio';
  if (h < 80) return 'grande';
  return 'mini_projeto';
}

/** Task atrasada: tem prazo, não concluída, prazo < hoje. */
export function atrasada(t: Pick<Task, 'prazo' | 'status'> & { subetapa?: string }, today?: string): boolean {
  if (!t.prazo) return false;
  if (t.status === STATUS.CONCLUIDO) return false;
  // Bloqueado e em homologação não contam como atrasadas — o time não tem ação direta.
  if (t.status === STATUS.BLOQUEADO) return false;
  if (t.subetapa === 'em_homologacao') return false;
  const ref = today ?? new Date().toISOString().slice(0, 10);
  return t.prazo < ref;
}

/** Quantos dias de atraso (negativo = ainda no prazo). */
export function diasAtraso(t: Pick<Task, 'prazo'>): number {
  if (!t.prazo) return 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazo = new Date(t.prazo + 'T00:00:00');
  return Math.floor((hoje.getTime() - prazo.getTime()) / 86400000);
}

/** Dias parados na etapa atual. */
export function agingDays(t: Pick<Task, 'statusEm'>): number {
  if (!t.statusEm) return 0;
  return Math.floor((Date.now() - t.statusEm) / 86400000);
}

export type AgingLevel = 'fresh' | 'warn' | 'stale';

/** Limites por status pra sinalizar represa. */
export function agingLevel(t: Pick<Task, 'status' | 'statusEm'>): AgingLevel {
  if (!t || t.status === STATUS.CONCLUIDO) return 'fresh';
  const thr: Record<string, [number, number]> = {
    andamento: [7, 14],
    bloqueado: [3, 7],
    backlog: [30, 60],
  };
  const limits = thr[t.status];
  if (!limits) return 'fresh';
  const d = agingDays(t);
  if (d >= limits[1]) return 'stale';
  if (d >= limits[0]) return 'warn';
  return 'fresh';
}

/** Linguagem natural pra "tempo numa etapa/status": hoje · 1 dia · N dias. */
export function fmtTempoEtapa(ts?: number | null): string {
  if (!ts) return '';
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return 'hoje';
  if (d === 1) return '1 dia';
  return `${d} dias`;
}

// ─── Tempo na sub-etapa (fonte única pra frase + cor) ───────────────────
//
// A "etapa" visualizada em Kanban/Backlog é a SUBETAPA (em_desenvolvimento,
// escopo_definido etc), não o status macro (andamento/bloqueado/etc).
// Por isso o tempo "nesta etapa" deve ser sempre baseado em subetapaEm.
// Se a task antiga não tem subetapaEm (legado), cai pra statusEm.

/** Timestamp da entrada na subetapa atual (fallback statusEm). */
function etapaTempoTs(t: Pick<Task, 'subetapaEm' | 'statusEm'>): number | null {
  return t.subetapaEm || t.statusEm || null;
}

/** Dias na subetapa atual, consistente entre Kanban e Backlog. */
export function etapaTempoDays(t: Pick<Task, 'subetapaEm' | 'statusEm'>): number {
  const ts = etapaTempoTs(t);
  if (!ts) return 0;
  return Math.floor((Date.now() - ts) / 86400000);
}

/** Cor de alerta da frase "X dias nesta etapa". Aplica só de
 *  `em_definicao` em diante e exceto `concluido`. Thresholds globais:
 *  ≥14d danger (vermelho), ≥7d warn (âmbar). */
export type EtapaColor = null | 'warn' | 'danger';
export function etapaTempoColor(
  t: Pick<Task, 'subetapa' | 'subetapaEm' | 'statusEm' | 'status'>,
): EtapaColor {
  if (t.status === STATUS.CONCLUIDO) return null;
  // STAGE_RANK · concluido/bloqueado = -1, backlog = 0, em_definicao = 1+
  // Importado lazy pra evitar ciclo em runtime — vide topo do arquivo.
  if ((STAGE_RANK[t.subetapa] ?? 0) < 1) return null;
  const d = etapaTempoDays(t);
  if (d >= 14) return 'danger';
  if (d >= 7) return 'warn';
  return null;
}

/** Label de atraso em linguagem natural: 'Xd atrasada' (sem o '+'). */
export function fmtAtrasoLabel(dias: number): string {
  if (dias <= 0) return '';
  if (dias === 1) return '1 dia atrasada';
  return `${dias} dias atrasada`;
}

/** Rank a partir do qual prazo e esforço passam a ser obrigatórios.
 *  3 = `escopo_definido` (definido em STAGE_RANK). Abaixo disso a task
 *  ainda está sendo cogitada/priorizada, então é cedo cobrar números. */
export const TRIAGE_RANK_GATE = 3;

/** Lista o que falta na task pra estar "triada". Vazio = ok.
 *  Sempre obrigatórios: cliente, projeto, responsável, prioridade.
 *  A partir de `escopo_definido` (rank >= 3): também prazo e esforço.
 *  (Onda 2.C: prioridade obrigatória em todas as subetapas — força
 *   revisão explícita, default 'P2' silencioso foi removido.) */
export function triageFailures(
  t: Pick<Task, 'status' | 'subetapa' | 'pessoaId' | 'clienteId' | 'projetoId' | 'prazo' | 'esforco' | 'prioridade'>,
): string[] {
  if (!t || t.status === STATUS.CONCLUIDO) return [];
  const rank = STAGE_RANK[t.subetapa] ?? 0;
  const out: string[] = [];
  if (!t.clienteId) out.push('sem cliente');
  if (!t.projetoId) out.push('sem projeto');
  if (!t.pessoaId) out.push('sem responsável');
  if (!t.prioridade) out.push('sem prioridade');
  if (rank >= TRIAGE_RANK_GATE && !t.prazo) out.push('sem prazo');
  if (rank >= TRIAGE_RANK_GATE && !Number(t.esforco)) out.push('sem esforço');
  return out;
}

export function needsTriage(t: Parameters<typeof triageFailures>[0]): boolean {
  return triageFailures(t).length > 0;
}

/** Formata 'YYYY-MM-DD' como 'DD/MM/YYYY'. */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, da] = d.split('-');
  return `${da}/${m}/${y}`;
}

export function fmtDateShort(d: string | null | undefined): string {
  if (!d) return '—';
  const [, m, da] = d.split('-');
  return `${da}/${m}`;
}

export function lblStatus(s: string | undefined | null): string {
  return ({ backlog: 'Backlog', andamento: 'Em andamento', bloqueado: 'Bloqueado', concluido: 'Concluído' } as Record<string, string>)[s ?? ''] ?? (s ?? '');
}

export function lblComplex(c: string | undefined | null): string {
  return ({ alta: 'Alta', media: 'Média', baixa: 'Baixa' } as Record<string, string>)[c ?? ''] ?? 'Média';
}

/** Normaliza string pra slug curto (lowercase, hífen, máx 24 chars). */
export function normalizeTag(s: string): string {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 24);
}

// ============ Janelas de prazo (filtros) ============

export type PrazoFilter = '' | 'atrasadas' | 'hoje' | 'semana' | 'sem' | 'd7' | 'd15' | 'mes';

/** ISO 'YYYY-MM-DD' do dia local (não UTC). */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Segunda e domingo da semana ISO em que cai a data. */
function weekRangeIso(iso: string): [string, string] {
  const d = new Date(iso + 'T00:00:00');
  const day = d.getDay(); // 0 dom .. 6 sab
  const diffMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [monday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10)];
}

/** Primeiro e último dia do mês em que cai a data. */
function monthRangeIso(iso: string): [string, string] {
  const d = new Date(iso + 'T00:00:00');
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const fmt = (x: Date) => {
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const da = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  };
  return [fmt(start), fmt(end)];
}

/** Testa se a task se encaixa na janela de prazo escolhida. */
export function matchesPrazoFilter(
  t: Pick<Task, 'prazo' | 'status'> & { subetapa?: string },
  mode: PrazoFilter,
): boolean {
  if (!mode) return true;
  if (mode === 'atrasadas') return atrasada(t);
  if (mode === 'sem') return !t.prazo;
  if (!t.prazo) return false;
  const today = todayIso();
  if (mode === 'hoje') return t.prazo === today;
  if (mode === 'semana') {
    const [mon, sun] = weekRangeIso(today);
    return t.prazo >= mon && t.prazo <= sun;
  }
  if (mode === 'd7') return t.prazo >= today && t.prazo <= addDaysIso(today, 7);
  if (mode === 'd15') return t.prazo >= today && t.prazo <= addDaysIso(today, 15);
  if (mode === 'mes') {
    const [start, end] = monthRangeIso(today);
    return t.prazo >= start && t.prazo <= end;
  }
  return true;
}

// ============ Bucketing semanal (capacidade 4 semanas) ============

/** ISO 'YYYY-MM-DD' da segunda-feira da semana de `d`. */
function weekStartMonday(d: string | Date): string {
  const dt = d instanceof Date ? new Date(d.getTime()) : new Date(d + 'T00:00:00');
  const day = dt.getDay(); // 0 dom, 1 seg … 6 sab
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt.toISOString().slice(0, 10);
}

/** Prazo pra análise: usa o da task ou hoje como fallback (sem escrever no campo). */
function effPrazoForAnalysis(t: Pick<Task, 'prazo'>, today?: string): string {
  if (t.prazo) return t.prazo;
  return today ?? todayIso();
}

/**
 * Índice da semana em que a task cai (relative a hoje):
 *  -1  → atrasada (segunda do prazo < segunda de hoje)
 *   0  → esta semana
 *   1-3 → próximas 3 semanas
 *  null → além de 4 semanas ou concluída
 */
export function taskWeekIndex(t: Pick<Task, 'prazo' | 'status'>, today?: string): number | null {
  if (t.status === STATUS.CONCLUIDO) return null;
  const ref = today ?? todayIso();
  const monRef = weekStartMonday(ref);
  const monTask = weekStartMonday(effPrazoForAnalysis(t, ref));
  if (monTask < monRef) return -1;
  const ms =
    new Date(monTask + 'T00:00:00Z').getTime() -
    new Date(monRef + 'T00:00:00Z').getTime();
  const weeks = Math.round(ms / (7 * 86400 * 1000));
  if (weeks < 0) return -1;
  if (weeks > 3) return null;
  return weeks;
}

export type CargaNivel = 'sobrecarga' | 'pressao' | 'ok' | 'folga' | 'sem-cap';

/** Classifica nível de carga pela % de capacidade alocada. */
export function cargaNivelFromPctCap(pctCap: number | null): CargaNivel {
  if (pctCap == null) return 'sem-cap';
  if (pctCap > 130) return 'sobrecarga';
  if (pctCap > 100) return 'pressao';
  if (pctCap < 60) return 'folga';
  return 'ok';
}



/**
 * Soma horas de uma lista de time_entries (entries em aberto ignoradas).
 */
export function sumTimeEntriesHours(entries: Array<{ startedAt: number; endedAt: number | null }>): number {
  let ms = 0;
  for (const e of entries) {
    if (!e.endedAt) continue;
    ms += Math.max(0, e.endedAt - e.startedAt);
  }
  return ms / 3_600_000;
}

/** Subetapas que exigem tempo real registrado antes de avançar (Onda 2.B). */
const REQUIRES_TEMPO_REAL = new Set([
  'em_homologacao',
  'em_revisao',
  'pronto_producao',
  'em_implantacao',
  'concluido',
]);

/**
 * Bucket D · campos obrigatórios não preenchidos pra subetapa atual da task.
 *
 * Centraliza as regras dos validators (validateSubetapaAdvance,
 * triageFailures, gate de reabertura) numa visão por-campo: dado uma
 * task, retorna o conjunto de field-names que estão pendentes.
 *
 * Usado pra pintar bordas vermelhas em inputs no modal, sem duplicar
 * lógica nos componentes.
 *
 * `wasConcluido` é true quando a task PREVIAMENTE estava em 'concluido'
 * mas agora foi movida pra outra subetapa (caso de reabertura).
 */
export function missingFieldsForCurrentSubetapa(
  t: Pick<Task,
    'subetapa' | 'status' | 'prioridade' | 'pessoaId' | 'clienteId' | 'projetoId' |
    'prazo' | 'esforco' | 'escopo' | 'tempoRealHoras' | 'criterioAceite' | 'valorEntregue' |
    'motivoReabertura'
  >,
  opts?: { timeEntriesHours?: number; wasConcluido?: boolean },
): Set<string> {
  const missing = new Set<string>();
  if (!t || t.status === STATUS.CONCLUIDO && t.subetapa === 'concluido') {
    // task concluída já — só checar valor_entregue/tempo_real (que são exigidos AO concluir)
  }
  const sub = t.subetapa;
  const rank = STAGE_RANK[sub] ?? 0;

  // Sempre obrigatórios (gates de Triagem)
  if (!t.clienteId) missing.add('clienteId');
  if (!t.projetoId) missing.add('projetoId');
  if (!t.pessoaId) missing.add('pessoaId');
  if (!t.prioridade) missing.add('prioridade');

  // A partir de escopo_definido (rank >= 3)
  if (rank >= TRIAGE_RANK_GATE) {
    if (!t.prazo) missing.add('prazo');
    if (!Number(t.esforco)) missing.add('esforco');
    if (!(t.criterioAceite && t.criterioAceite.trim().length > 0)) missing.add('criterioAceite');
  }

  // A partir de em_definicao (rank >= 1)
  if (rank >= 1) {
    if (!t.escopo || t.escopo.length === 0) missing.add('escopo');
  }

  // tempo_real em em_homologacao→concluido (exceto bloqueado)
  if (REQUIRES_TEMPO_REAL.has(sub)) {
    const manual = Number(t.tempoRealHoras) || 0;
    const fromSheet = opts?.timeEntriesHours ?? 0;
    if (manual <= 0 && fromSheet <= 0) missing.add('tempoRealHoras');
  }

  // valor_entregue no concluido
  if (sub === 'concluido') {
    if (!(t.valorEntregue && t.valorEntregue.trim().length > 0)) missing.add('valorEntregue');
  }

  // motivo_reabertura quando reabrindo
  if (opts?.wasConcluido && sub !== 'concluido') {
    if (!(t.motivoReabertura && t.motivoReabertura.trim().length > 0)) missing.add('motivoReabertura');
  }

  return missing;
}

/**
 * Bucket D · Ondas 2.A + 2.B + 3.A · gate de avanço de subetapa.
 *
 * Regras (alinhadas com docs/gestao/DISCIPLINA_DADOS.md):
 *   • em_definicao+        →  escopo[] não vazio                (2.6)
 *   • escopo_definido+     →  esforco > 0                       (2.4)
 *   • escopo_definido+     →  criterio_aceite não vazio         (3.1)
 *   • em_homologacao→concluido (exceto bloqueado)
 *                          →  tempoRealHoras > 0                (2.5)
 *                             fallback: opts.timeEntriesHours > 0
 *                             → retorna autoFillTempo (modo d:
 *                                só preenche se manual vazio).
 *   • concluido            →  valor_entregue não vazio          (3.5)
 *
 * Bloqueado tem rank -1 → não bloqueia.
 */
export function validateSubetapaAdvance(
  task: Pick<Task, 'esforco' | 'escopo' | 'tempoRealHoras' | 'criterioAceite' | 'valorEntregue'>,
  novaSubetapa: string,
  opts?: { timeEntriesHours?: number; hasOpenPreReqs?: boolean },
): { ok: true; autoFillTempo?: number } | { ok: false; error: string } {
  if (novaSubetapa === 'bloqueado') return { ok: true };

  const rank = STAGE_RANK[novaSubetapa] ?? 0;
  if (rank >= 1 && (!task.escopo || task.escopo.length === 0)) {
    return { ok: false, error: 'Preencha o escopo técnico antes de avançar.' };
  }
  if (rank >= 3 && !(Number(task.esforco) > 0)) {
    return { ok: false, error: 'Preencha o esforço estimado (h) antes de avançar.' };
  }
  if (rank >= 3 && !(task.criterioAceite && task.criterioAceite.trim().length > 0)) {
    return { ok: false, error: 'Preencha o critério de aceite antes de avançar.' };
  }

  if (REQUIRES_TEMPO_REAL.has(novaSubetapa)) {
    const manual = Number(task.tempoRealHoras) || 0;
    if (manual > 0) {
      // ok — passa pro check de valor_entregue abaixo se concluido
    } else {
      const sumHours = opts?.timeEntriesHours ?? 0;
      if (sumHours > 0) {
        // Modo (d): manual vazio → usa timesheet como fallback.
        if (novaSubetapa === 'concluido' && !(task.valorEntregue && task.valorEntregue.trim().length > 0)) {
          return { ok: false, error: 'Preencha o valor entregue (impacto realizado) antes de concluir.' };
        }
        return { ok: true, autoFillTempo: Math.round(sumHours * 100) / 100 };
      }
      return { ok: false, error: 'Registre o tempo real (h) ou lance no timesheet antes de avançar.' };
    }
  }

  if (novaSubetapa === 'concluido' && !(task.valorEntregue && task.valorEntregue.trim().length > 0)) {
    return { ok: false, error: 'Preencha o valor entregue (impacto realizado) antes de concluir.' };
  }

  // 3.B · gate de conclusão por dependências
  if (novaSubetapa === 'concluido' && opts?.hasOpenPreReqs) {
    return { ok: false, error: 'Há tasks pré-requisito ainda abertas — conclua-as primeiro.' };
  }

  return { ok: true };
}

