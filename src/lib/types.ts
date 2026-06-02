/**
 * Tipos in-memory das entidades — mesmo formato que o app Alpine usa
 * em runtime (camelCase, datas como epoch ms, FKs como '' quando null).
 *
 * Estes tipos representam o estado do client store, NÃO as linhas
 * cruas do banco (essas vivem em src/lib/db/schema.ts). Adapters em
 * src/lib/adapters.ts convertem entre os dois.
 */

export type TaskStatus = 'backlog' | 'andamento' | 'bloqueado' | 'concluido';
export type Prioridade = 'P0' | 'P1' | 'P2' | 'P3';
export type Complexidade = 'alta' | 'media' | 'baixa';
export type Role = 'admin' | 'interno' | 'cliente';

export interface ChecklistItem {
  id?: string;
  /** Texto do item. Campo `body` pra bater com o JSON do DB (convenção do app Alpine). */
  body: string;
  done: boolean;
}

export interface Task {
  id: string;
  titulo: string;
  /** Lazy: undefined quando não carregada (boot exclui pra payload menor). */
  descricao?: string;
  clienteId: string;
  projetoId: string;
  pessoaId: string;
  prioridade: Prioridade;
  esforco: number;
  complexidade: Complexidade;
  prazo: string;
  status: TaskStatus;
  subetapa: string;
  bloqueadoPor: string;
  visivelCliente: boolean;
  criadoEm: number;
  statusEm: number;
  subetapaEm: number;
  /** Timestamp de quando a task entrou em andamento pela última vez. Null se nunca entrou. */
  andamentoEm: number;
  ordem: number | null;
  tags: string[];
  checklist: ChecklistItem[];
  reopenCount: number;
  escopo: string[];
  tempoRealHoras: number | null;
  externalSource: string;
  externalId: string;
  arquivadoEm: string | null;
  criadoPorIa: boolean;
  privada: boolean;
  /** Status do dispatch pro Salesforce — 'synced' | 'error' | ''. Set por
   *  dispatch-webhook após cada update da task quando external_source=salesforce. */
  webhookSyncStatus: string;
  /** Mensagem de erro do último dispatch falho. */
  webhookSyncError: string;
}

export interface Cliente {
  id: string;
  nome: string;
  tier: string;
  ehInterno: boolean;
  arquivadoEm: string | null;
  dominios: string[];
  /** Quando true, modal de task NÃO autosalva — usuário precisa clicar Salvar
   *  pra disparar o webhook pro Salesforce. */
  webhookEnabled: boolean;
  /** Hex #RRGGBB usado como background do header do Portal cliente.
   *  Null = default DS (--bg-portal verde Kliente escuro). */
  corPortal: string | null;
  /** 'light' (texto branco) ou 'dark' (texto preto) sobre cor_portal.
   *  Null = light (default). */
  corPortalTexto: 'light' | 'dark' | null;
}

export interface Projeto {
  id: string;
  nome: string;
  clienteId: string;
  slaRespostaHoras: number | null;
  slaEntregaDias: number | null;
  orcamentoHoras: number | null;
  tipo: string;
  arquivadoEm: string | null;
}

export interface Pessoa {
  id: string;
  nome: string;
  email: string | null;
  user_id: string | null;
  invited_at: string | null;
  role: Role;
  cliente_id: string | null;
  cliente_principal_id: string | null;
  cliente_secundario_id: string | null;
  capacidade_horas_semana: number | null;
  skills: string[] | null;
  senioridade: string | null;
  is_ceo?: boolean;
}

export interface TimeEntry {
  id: string;
  taskId: string;
  pessoaId: string;
  startedAt: number;
  endedAt: number | null;
  note: string | null;
  criadoEm: number;
}
