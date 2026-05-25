-- Adiciona arquivamento em tasks (paralelo ao já existente em clientes/projetos).
-- Task com arquivado_em != null some de listas/dashboards/heurísticas mas
-- preserva todo o histórico (comments, status_history, field_history).
-- Idempotente.

alter table tasks add column if not exists arquivado_em timestamptz;

-- Índice parcial: a maioria das queries vai filtrar arquivadas fora,
-- então só indexamos o conjunto relevante.
create index if not exists idx_tasks_arquivado_em
  on tasks (arquivado_em)
  where arquivado_em is not null;

comment on column tasks.arquivado_em is
  'Quando preenchido, esconde a task de listas/dashboards/heurísticas. Diferente de status=concluido (concluído conta como entrega; arquivado é descarte).';
