-- Patch para suportar ingestão via API/webhook (Salesforce, etc.)
-- Roda uma vez no SQL Editor do Supabase, depois de schema.sql.

alter table tasks add column if not exists external_source text;
alter table tasks add column if not exists external_id text;

-- Garante que o mesmo (source, id) externo só vire UMA task aqui.
-- Permite múltiplas tasks com external_source = null (criação manual no app).
create unique index if not exists tasks_external_uq
  on tasks (external_source, external_id)
  where external_source is not null;

create index if not exists tasks_external_source_idx on tasks(external_source);
