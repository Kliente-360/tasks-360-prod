/**
 * Schema Drizzle — DRAFT da Onda 0.
 *
 * Portado de lib/adapters.js (TASK_FIELDS etc.) + CONTEXT.md §7 do app
 * atual. Cobre as tabelas-núcleo. Alguns tipos (numeric vs integer,
 * nullability exata) são best-effort sem o banco à mão.
 *
 * ANTES de usar pra valer: rodar `npm run db:pull` com a DATABASE_URL
 * real — o drizzle-kit introspecta o Postgres e reconcilia este arquivo
 * com a verdade. Tabelas ainda não modeladas aqui (task_field_history,
 * task_dependencies, task_attachments, notifications, usage_events,
 * auth_history, webhook_config) vêm completas no pull.
 */
import {
  pgTable, uuid, text, boolean, integer, numeric, timestamp, date, jsonb,
} from 'drizzle-orm/pg-core';

export const clientes = pgTable('clientes', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  tier: text('tier'), // estrategico | potencial | descoberta | null
  ehInterno: boolean('eh_interno').notNull().default(false),
  dominios: text('dominios').array().notNull().default([]),
  arquivadoEm: timestamp('arquivado_em', { withTimezone: true }),
  webhookEnabled: boolean('webhook_enabled').notNull().default(false),
});

export const projetos = pgTable('projetos', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  clienteId: uuid('cliente_id').references(() => clientes.id),
  tipo: text('tipo'), // sustentacao | projeto | discovery
  slaRespostaHoras: integer('sla_resposta_horas'),
  slaEntregaDias: integer('sla_entrega_dias'),
  orcamentoHoras: numeric('orcamento_horas'),
  arquivadoEm: timestamp('arquivado_em', { withTimezone: true }),
});

export const pessoas = pgTable('pessoas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  email: text('email'),
  userId: uuid('user_id'),
  invitedAt: timestamp('invited_at', { withTimezone: true }),
  role: text('role').notNull().default('interno'), // admin | interno | cliente
  clienteId: uuid('cliente_id').references(() => clientes.id),
  clientePrincipalId: uuid('cliente_principal_id').references(() => clientes.id),
  clienteSecundarioId: uuid('cliente_secundario_id').references(() => clientes.id),
  capacidadeHorasSemana: numeric('capacidade_horas_semana'),
  skills: text('skills').array(),
  senioridade: text('senioridade'), // junior | pleno | senior | lead
  isCeo: boolean('is_ceo').notNull().default(false),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  titulo: text('titulo').notNull(),
  descricao: text('descricao'),
  clienteId: uuid('cliente_id').references(() => clientes.id),
  projetoId: uuid('projeto_id').references(() => projetos.id),
  pessoaId: uuid('pessoa_id').references(() => pessoas.id),
  prioridade: text('prioridade').default('P2'), // P0..P3
  esforco: numeric('esforco'),
  complexidade: text('complexidade').default('media'), // alta | media | baixa
  prazo: date('prazo'),
  status: text('status').notNull().default('backlog'), // macro derivado por trigger
  subetapa: text('subetapa').notNull().default('backlog'),
  bloqueadoPor: text('bloqueado_por'),
  visivelCliente: boolean('visivel_cliente').notNull().default(true),
  tags: text('tags').array().notNull().default([]),
  checklist: jsonb('checklist').notNull().default([]),
  reopenCount: integer('reopen_count').notNull().default(0),
  tipoTrabalho: text('tipo_trabalho'),
  tempoRealHoras: numeric('tempo_real_horas'),
  ordem: numeric('ordem'),
  criadoPorIa: boolean('criado_por_ia').notNull().default(false),
  privada: boolean('privada').notNull().default(false),
  externalSource: text('external_source'), // salesforce | null
  externalId: text('external_id'),
  arquivadoEm: timestamp('arquivado_em', { withTimezone: true }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  statusEm: timestamp('status_em', { withTimezone: true }),
  subetapaEm: timestamp('subetapa_em', { withTimezone: true }),
});

export const taskComments = pgTable('task_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'), // não-nulo = resposta
  body: text('body').notNull(),
  author: text('author'),
  authorPessoaId: uuid('author_pessoa_id').references(() => pessoas.id),
  authorExternalId: text('author_external_id'),
  visivelCliente: boolean('visivel_cliente').notNull().default(false),
  fromCliente: boolean('from_cliente').notNull().default(false),
  editedEm: timestamp('edited_em', { withTimezone: true }),
  externalSource: text('external_source'),
  externalId: text('external_id'),
  postedEm: timestamp('posted_em', { withTimezone: true }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

export type Cliente = typeof clientes.$inferSelect;
export type Projeto = typeof projetos.$inferSelect;
export type Pessoa = typeof pessoas.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskComment = typeof taskComments.$inferSelect;
