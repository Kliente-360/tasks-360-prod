-- Histórico de mudanças de campos (não-status) em tasks.
-- task_status_history continua dedicado a status (drives lead/cycle time).
-- Esta tabela captura prazo, esforço, prioridade, complexidade, pessoa,
-- subetapa, tipo_trabalho, tempo_real_horas, bloqueado_por.
--
-- Idempotente. Sem destrutivo.
--
-- Premissas:
--   - Inserção é app-side (saveTask diff). Edge Functions externas não
--     logam ainda — fica como melhoria futura.
--   - Realtime habilitado pra atualizar timeline ao vivo.
--
-- Rollback: drop table if exists task_field_history;

create table if not exists task_field_history (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references tasks(id) on delete cascade,
  field           text not null,
  from_value      text,
  to_value        text,
  actor_pessoa_id uuid references pessoas(id) on delete set null,
  actor_source    text not null default 'app',
  occurred_at     timestamptz not null default now()
);

create index if not exists idx_task_field_hist_task on task_field_history(task_id, occurred_at desc);
create index if not exists idx_task_field_hist_field on task_field_history(field);

-- Adiciona à publication de realtime se houver
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'task_field_history'
    ) then
      alter publication supabase_realtime add table task_field_history;
    end if;
  end if;
end $$;

-- RLS: mesma política do task_status_history (leitura aberta autenticada,
-- escrita aberta autenticada). Ajustar quando endurecer permissões.
alter table task_field_history enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'task_field_history' and policyname = 'task_field_history_select'
  ) then
    create policy task_field_history_select on task_field_history
      for select using (auth.role() = 'authenticated');
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'task_field_history' and policyname = 'task_field_history_insert'
  ) then
    create policy task_field_history_insert on task_field_history
      for insert with check (auth.role() = 'authenticated');
  end if;
end $$;
