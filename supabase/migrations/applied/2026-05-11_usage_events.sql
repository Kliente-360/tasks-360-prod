-- Telemetria de uso de features. Fire-and-forget do front.
-- Objetivo: medir quais funcionalidades são mais/menos usadas
-- pra priorizar investimento / deprecação.
-- Retenção: 90 dias (chamar fn_usage_events_cleanup via cron ou manualmente).
-- Idempotente.

create table if not exists usage_events (
  id           uuid primary key default gen_random_uuid(),
  ts           timestamptz not null default now(),
  pessoa_id    uuid references pessoas(id) on delete set null,
  event        text not null,
  meta         jsonb,
  session_id   text,
  app_version  text
);

create index if not exists idx_usage_events_event_ts
  on usage_events (event, ts desc);

create index if not exists idx_usage_events_pessoa_ts
  on usage_events (pessoa_id, ts desc);

-- RLS: qualquer authenticated pode INSERT (registrar próprio uso);
-- SELECT só admin (lê adoption dashboard).
alter table usage_events enable row level security;

drop policy if exists usage_events_insert_authenticated on usage_events;
create policy usage_events_insert_authenticated
  on usage_events for insert
  to authenticated
  with check (true);

drop policy if exists usage_events_select_admin on usage_events;
create policy usage_events_select_admin
  on usage_events for select
  to authenticated
  using (
    exists (
      select 1 from pessoas p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

-- Cleanup de eventos com >90 dias. Chamar via cron (pg_cron) ou
-- manualmente quando notar tamanho.
create or replace function fn_usage_events_cleanup()
returns int
language plpgsql
security definer
as $$
declare
  deleted int;
begin
  delete from usage_events where ts < now() - interval '90 days';
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

comment on table usage_events is
  'Telemetria de uso (90d). Fire-and-forget. RLS: insert open authenticated, select admin only.';
