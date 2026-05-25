-- Onda C de heurísticas — dependências e progresso.
-- 3 atributos:
--   1. tasks.tipo_trabalho text check
--   2. tasks.tempo_real_horas numeric (manual)
--   3. tabela task_dependencies(task_id, depende_de_id) com FK + unique
--
-- Idempotente. Sem destrutivo.
--
-- Premissas:
--   - Onda B aplicada (não bloqueia).
--   - Dependência é direcional: task_id depende de depende_de_id.
--   - Sem prevenção de ciclo no banco (app valida ao criar).
--
-- Rollback:
--   alter table tasks drop column tipo_trabalho;
--   alter table tasks drop column tempo_real_horas;
--   drop table if exists task_dependencies;

-- 1. tipo_trabalho em tasks
alter table tasks
  add column if not exists tipo_trabalho text;

do $$ begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'tasks_tipo_trabalho_check'
  ) then
    alter table tasks
      add constraint tasks_tipo_trabalho_check
      check (tipo_trabalho is null or tipo_trabalho in ('bug','feature','discovery','manutencao','admin'));
  end if;
end $$;

-- 2. tempo_real_horas em tasks
alter table tasks
  add column if not exists tempo_real_horas numeric;

-- 3. task_dependencies
create table if not exists task_dependencies (
  task_id        uuid not null references tasks(id) on delete cascade,
  depende_de_id  uuid not null references tasks(id) on delete cascade,
  criado_em      timestamptz not null default now(),
  primary key (task_id, depende_de_id),
  check (task_id <> depende_de_id)
);

create index if not exists idx_task_deps_task on task_dependencies(task_id);
create index if not exists idx_task_deps_dep  on task_dependencies(depende_de_id);

-- Adiciona à publication de realtime se houver
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'task_dependencies'
    ) then
      alter publication supabase_realtime add table task_dependencies;
    end if;
  end if;
end $$;
