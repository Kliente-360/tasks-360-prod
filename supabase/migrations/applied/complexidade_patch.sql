-- ============================================================
-- complexidade_patch.sql
-- Adiciona coluna `complexidade` em tasks com valores fixos:
-- 'alta' | 'media' | 'baixa'. Default 'media'.
-- Idempotente — pode ser rodado múltiplas vezes.
-- ============================================================

alter table tasks
  add column if not exists complexidade text not null default 'media';

-- Garante check constraint (drop antes pra permitir re-run com valores diferentes).
alter table tasks drop constraint if exists tasks_complexidade_check;
alter table tasks
  add constraint tasks_complexidade_check
  check (complexidade in ('alta','media','baixa'));

-- Index para futuros filtros / dashboards por complexidade.
create index if not exists idx_tasks_complexidade on tasks(complexidade);
