-- Login + histórico de mudanças.
-- Roda uma vez no SQL Editor depois dos patches anteriores.

-- 1. Liga pessoas ao Supabase Auth (1 pessoa = 1 user, opcional)
alter table pessoas add column if not exists email text;
alter table pessoas add column if not exists user_id uuid unique references auth.users(id) on delete set null;
create index if not exists pessoas_user_idx on pessoas(user_id);
create unique index if not exists pessoas_email_uq on pessoas(lower(email)) where email is not null;

-- 2. Histórico de mudanças de status
create table if not exists task_status_history (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references tasks(id) on delete cascade,
  from_status     text,
  to_status       text not null,
  actor_pessoa_id uuid references pessoas(id) on delete set null,
  actor_source    text,        -- 'app' | 'salesforce' | 'seed'
  occurred_at     timestamptz not null default now()
);

create index if not exists task_status_history_task_idx
  on task_status_history(task_id, occurred_at desc);

alter table task_status_history enable row level security;

drop policy if exists prototipo_all on task_status_history;
create policy prototipo_all on task_status_history for all using (true) with check (true);

alter publication supabase_realtime add table task_status_history;
