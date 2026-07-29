-- Realtime coverage · time_entries (v1.03.208)
--
-- Adiciona time_entries à publication supabase_realtime + replica identity
-- full pra que UPDATEs cheguem no cliente com payload completo (não só PK).
-- Usado pra que cronômetro de outra pessoa apareça na Timesheet em <2s
-- sem F5, e pra que gates de esforço no Kanban/Foco reflitam soma de
-- horas registradas por outros usuários.
--
-- Idempotente. Rollback: drop table from publication + reset replica identity default.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'time_entries'
  ) then
    alter publication supabase_realtime add table public.time_entries;
  end if;
end $$;

alter table public.time_entries replica identity full;
