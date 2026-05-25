-- ============================================================
-- heuristicas_onda_a_patch.sql
-- Atributos pra Onda A das heurísticas pré-IA. Ver ROADMAP §9.
--
-- Idempotente. Roda uma vez.
-- ============================================================

-- =================== TASKS ===================
-- Tamanho ortogonal a esforço: muda regra de "está em risco?".
alter table tasks add column if not exists tamanho text;
alter table tasks drop constraint if exists tasks_tamanho_check;
alter table tasks add constraint tasks_tamanho_check
  check (tamanho is null or tamanho in ('mini','small','medio','grande','mini_projeto'));
create index if not exists tasks_tamanho_idx on tasks(tamanho);

-- =================== PESSOAS ===================
-- Cliente principal e secundário (drives "quem é dono de cada cliente").
alter table pessoas add column if not exists cliente_principal_id uuid references clientes(id) on delete set null;
alter table pessoas add column if not exists cliente_secundario_id uuid references clientes(id) on delete set null;
create index if not exists pessoas_cliente_principal_idx on pessoas(cliente_principal_id);
create index if not exists pessoas_cliente_secundario_idx on pessoas(cliente_secundario_id);

-- Capacidade pra cálculo de "% alocado".
alter table pessoas add column if not exists capacidade_horas_semana int not null default 40;

-- Skills como tags (sales-cloud, service-cloud, apex, lwc, integracao, etc.)
alter table pessoas add column if not exists skills text[] not null default '{}'::text[];
create index if not exists pessoas_skills_idx on pessoas using gin(skills);

-- =================== CLIENTES ===================
alter table clientes add column if not exists tier text;
alter table clientes drop constraint if exists clientes_tier_check;
alter table clientes add constraint clientes_tier_check
  check (tier is null or tier in ('estrategico','regular','oportunidade'));

-- =================== PROJETOS ===================
-- SLA contratado e orçamento (alimenta breach automático e burndown).
alter table projetos add column if not exists sla_resposta_horas int;
alter table projetos add column if not exists sla_entrega_dias int;
alter table projetos add column if not exists orcamento_horas int;
