-- 2026-06-01 · escopo em tasks (array de skills)
-- Substitui tipo_trabalho (enum string) por array de skills alinhado
-- com pessoas.skills — permite highlight de responsáveis compatíveis.
-- tipo_trabalho é mantido na coluna (não dropa) por conter dados históricos.
-- Idempotente.

alter table tasks add column if not exists escopo text[] not null default '{}'::text[];
create index if not exists tasks_escopo_idx on tasks using gin(escopo);
