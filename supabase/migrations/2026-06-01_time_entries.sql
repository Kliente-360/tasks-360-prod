-- 2026-06-01 · Cronômetro start/stop — tabela time_entries
-- Cada linha = 1 sessão de trabalho cronometrada numa task.
-- ended_at NULL = timer ainda em execução.
-- Idempotente.

create table if not exists time_entries (
  id          uuid        primary key default gen_random_uuid(),
  task_id     uuid        not null references tasks(id) on delete cascade,
  pessoa_id   uuid        not null references pessoas(id) on delete cascade,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  note        text,
  criado_em   timestamptz not null default now()
);

create index if not exists time_entries_task_idx    on time_entries(task_id);
create index if not exists time_entries_pessoa_idx  on time_entries(pessoa_id);
create index if not exists time_entries_started_idx on time_entries(started_at desc);

-- Garante que cada pessoa tenha no máximo 1 timer aberto por vez
create unique index if not exists time_entries_open_unique
  on time_entries(pessoa_id)
  where ended_at is null;

alter table time_entries enable row level security;

-- Admin: acesso total
drop policy if exists time_entries_admin_all on time_entries;
create policy time_entries_admin_all on time_entries
  for all
  using (app_pessoa_role() = 'admin')
  with check (app_pessoa_role() = 'admin');

-- Interno: lê/escreve as próprias entradas
drop policy if exists time_entries_self_select on time_entries;
create policy time_entries_self_select on time_entries
  for select
  using (app_pessoa_role() = 'interno' and pessoa_id = app_pessoa_id());

drop policy if exists time_entries_self_insert on time_entries;
create policy time_entries_self_insert on time_entries
  for insert
  with check (app_pessoa_role() = 'interno' and pessoa_id = app_pessoa_id());

drop policy if exists time_entries_self_update on time_entries;
create policy time_entries_self_update on time_entries
  for update
  using  (app_pessoa_role() = 'interno' and pessoa_id = app_pessoa_id())
  with check (app_pessoa_role() = 'interno' and pessoa_id = app_pessoa_id());

drop policy if exists time_entries_self_delete on time_entries;
create policy time_entries_self_delete on time_entries
  for delete
  using (app_pessoa_role() = 'interno' and pessoa_id = app_pessoa_id());
