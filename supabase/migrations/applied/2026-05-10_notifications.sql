-- ============================================================
-- notifications_patch.sql
-- Cria tabela de notificações in-app pra mentions, atribuições
-- e ações de cliente externo. RLS aberta como o resto do protótipo.
--
-- Dependências: schema.sql, roles_portal_patch.sql.
-- Idempotente.
-- ============================================================

create table if not exists notifications (
  id                  uuid primary key default gen_random_uuid(),
  recipient_pessoa_id uuid not null references pessoas(id) on delete cascade,
  kind                text not null,
  payload             jsonb not null default '{}'::jsonb,
  source_task_id      uuid references tasks(id) on delete cascade,
  source_comment_id   uuid references task_comments(id) on delete cascade,
  criado_em           timestamptz not null default now(),
  read_at             timestamptz
);

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('mention','assigned','comment_on_my_task','cliente_respondeu','generico'));

create index if not exists notifications_recipient_idx
  on notifications(recipient_pessoa_id, criado_em desc);
create index if not exists notifications_unread_idx
  on notifications(recipient_pessoa_id) where read_at is null;

alter table notifications enable row level security;
drop policy if exists prototipo_all on notifications;
create policy prototipo_all on notifications for all using (true) with check (true);

-- Habilita realtime pra inserts/updates dispararem subscribe no app
alter publication supabase_realtime add table notifications;
