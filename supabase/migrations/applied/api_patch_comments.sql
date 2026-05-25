-- Comentários por task (Chatter posts vindos do Salesforce).
-- Roda uma vez no SQL Editor depois de schema.sql + api_patch.sql.

create table if not exists task_comments (
  id                  uuid primary key default gen_random_uuid(),
  task_id             uuid not null references tasks(id) on delete cascade,
  external_source     text,
  external_id         text,                       -- FeedItem.Id (dedupe)
  author              text,
  author_external_id  text,                       -- User.Id no SF (opcional)
  body                text not null,
  posted_em           timestamptz,                -- CreatedDate do FeedItem
  criado_em           timestamptz not null default now()
);

create index if not exists task_comments_task_idx on task_comments(task_id);

create unique index if not exists task_comments_external_uq
  on task_comments (external_source, external_id)
  where external_source is not null;

alter table task_comments enable row level security;

drop policy if exists prototipo_all on task_comments;
create policy prototipo_all on task_comments for all using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table task_comments;
