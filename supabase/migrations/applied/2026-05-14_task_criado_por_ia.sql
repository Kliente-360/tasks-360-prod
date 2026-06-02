-- Flag de origem: marca tasks criadas por automação de IA (Cowork etc).
-- Default false (origem humana). Edge function `ingest-task` pode setar via
-- body { criado_por_ia: true }. UI mostra chip 🤖 IA ao lado do título e
-- permite filtrar "só IA" na Triagem pra separar fluxos.

alter table tasks
  add column if not exists criado_por_ia boolean not null default false;

create index if not exists idx_tasks_criado_por_ia
  on tasks (criado_por_ia) where criado_por_ia = true;
