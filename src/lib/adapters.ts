/**
 * Adapters DB row → objeto in-memory (camelCase, ms, '' pra FK null).
 * Portado de lib/adapters.js do app Alpine. Mantém o mesmo shape em
 * runtime pra reuso de helpers (task-utils) e lógica idêntica de UI.
 */

import type { Cliente, Projeto, Pessoa, Task, Complexidade, Prioridade, TaskStatus } from './types';

type Row = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? '' : String(v));
const num = (v: unknown): number => Number(v) || 0;
const numNull = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const dateMs = (v: unknown): number => (v ? new Date(v as string).getTime() : 0);
const dateIso = (v: unknown): string | null => (v ? String(v) : null);

export function taskFromDb(r: Row): Task {
  return {
    id: str(r.id),
    titulo: str(r.titulo),
    // descricao: lazy — preserva undefined quando não veio no SELECT.
    descricao: r.descricao === undefined ? undefined : str(r.descricao),
    clienteId: str(r.cliente_id),
    projetoId: str(r.projeto_id),
    pessoaId: str(r.pessoa_id),
    prioridade: (r.prioridade as Prioridade) || 'P2',
    esforco: num(r.esforco),
    complexidade: ((r.complexidade as Complexidade) || 'media'),
    prazo: str(r.prazo),
    status: ((r.status as TaskStatus) || 'backlog'),
    subetapa: str(r.subetapa) || 'backlog',
    bloqueadoPor: str(r.bloqueado_por),
    visivelCliente: r.visivel_cliente !== false,
    criadoEm: dateMs(r.criado_em),
    statusEm: dateMs(r.status_em),
    subetapaEm: dateMs(r.subetapa_em),
    ordem: numNull(r.ordem),
    tags: arr<string>(r.tags),
    // Normaliza itens salvos com chave `text` (bug temporário do preview
    // pré-v1.02.161) pra `body` — convenção do app Alpine + DB.
    checklist: arr<Record<string, unknown>>(r.checklist).map((c) => ({
      id: c.id as string | undefined,
      body: (c.body ?? c.text ?? '') as string,
      done: c.done === true,
    })),
    reopenCount: num(r.reopen_count),
    tipoTrabalho: str(r.tipo_trabalho),
    tempoRealHoras: numNull(r.tempo_real_horas),
    externalSource: str(r.external_source),
    externalId: str(r.external_id),
    arquivadoEm: dateIso(r.arquivado_em),
    criadoPorIa: r.criado_por_ia === true,
    privada: r.privada === true,
    webhookSyncStatus: str(r.webhook_sync_status),
    webhookSyncError: str(r.webhook_sync_error),
  };
}

export function clienteFromDb(r: Row): Cliente {
  return {
    id: str(r.id),
    nome: str(r.nome),
    tier: str(r.tier),
    ehInterno: r.eh_interno === true,
    arquivadoEm: dateIso(r.arquivado_em),
    dominios: arr<string>(r.dominios),
    webhookEnabled: r.webhook_enabled === true,
  };
}

export function projetoFromDb(r: Row): Projeto {
  return {
    id: str(r.id),
    nome: str(r.nome),
    clienteId: str(r.cliente_id),
    slaRespostaHoras: numNull(r.sla_resposta_horas),
    slaEntregaDias: numNull(r.sla_entrega_dias),
    orcamentoHoras: numNull(r.orcamento_horas),
    tipo: str(r.tipo),
    arquivadoEm: dateIso(r.arquivado_em),
  };
}

export function pessoaFromDb(r: Row): Pessoa {
  return {
    id: str(r.id),
    nome: str(r.nome),
    email: (r.email as string) ?? null,
    user_id: (r.user_id as string) ?? null,
    invited_at: (r.invited_at as string) ?? null,
    role: ((r.role as Pessoa['role']) || 'interno'),
    cliente_id: (r.cliente_id as string) ?? null,
    cliente_principal_id: (r.cliente_principal_id as string) ?? null,
    cliente_secundario_id: (r.cliente_secundario_id as string) ?? null,
    capacidade_horas_semana: numNull(r.capacidade_horas_semana),
    skills: (r.skills as string[]) ?? null,
    senioridade: (r.senioridade as string) ?? null,
    is_ceo: r.is_ceo === true,
  };
}

/** Colunas leves carregadas no boot. `descricao` é lazy (modal puxa). */
export const TASK_LIGHT_COLS =
  'id,titulo,cliente_id,projeto_id,pessoa_id,prioridade,esforco,complexidade,prazo,status,subetapa,bloqueado_por,visivel_cliente,criado_em,status_em,subetapa_em,ordem,tags,checklist,reopen_count,tipo_trabalho,tempo_real_horas,external_source,external_id,arquivado_em,criado_por_ia,privada,webhook_sync_status,webhook_sync_error';
