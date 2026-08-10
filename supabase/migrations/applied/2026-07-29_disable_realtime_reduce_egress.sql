-- Disable realtime · reduce egress (jul/2026)
--
-- Contexto: Supabase alertou 14.61 GB de 5.5 GB de egress (bandwidth).
-- Origem principal: `replica identity full` em 7 tabelas + publication
-- realtime ativa. Toda UPDATE mandava a ROW INTEIRA via WAL/logical
-- replication pros subscribers (incluindo colunas grandes como
-- tasks.descricao, task_comments.body, checklist JSON).
--
-- Decisão: desligar realtime completamente. Frontend passa a depender
-- de boot + refresh manual (click no logo). CRUD via HTTP continua
-- funcionando 100% igual. Perde-se sincronização instantânea entre
-- múltiplos users no mesmo momento, mas isso não é essencial pra o
-- time de ~10 pessoas hoje.
--
-- Rollback (se quisermos religar realtime no futuro):
--   1. re-add tabelas ao publication (ver 2026-06-08_realtime_...sql)
--   2. `alter table X replica identity full` nas tabelas essenciais
--   3. re-enable channel setup em src/lib/data-store.tsx

-- ═══ 1. Remove tabelas da publication supabase_realtime ═══
do $$
declare
  tbl text;
begin
  for tbl in
    select tablename from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
  loop
    execute format('alter publication supabase_realtime drop table public.%I', tbl);
  end loop;
end $$;

-- ═══ 2. Reset replica identity pra default (só PK no WAL) ═══
-- default = usa PK como identifier · não emite row completa em UPDATE.
alter table public.clientes            replica identity default;
alter table public.notifications       replica identity default;
alter table public.pessoas             replica identity default;
alter table public.projetos            replica identity default;
alter table public.task_comments       replica identity default;
alter table public.task_field_history  replica identity default;
alter table public.tasks               replica identity default;
alter table public.time_entries        replica identity default;
