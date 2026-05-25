-- Melhorias na integração Salesforce:
--
--  1. webhook_enabled em clientes   — controla autosave no modal de task
--  2. last_ingest_at em tasks/comments — anti-loop: ingest marca o update
--     e o trigger ignora updates com esse campo alterado
--  3. webhook_sync_status/error em tasks — feedback de sucesso/erro ao front
--  4. Trigger webhook_task_update atualizado com guard anti-loop
--  5. Trigger webhook_comment atualizado com guard anti-loop
-- ─────────────────────────────────────────────────────────────────

-- 1) webhook_enabled em clientes
alter table clientes
  add column if not exists webhook_enabled boolean not null default false;

-- 2) last_ingest_at: marcador de "esse update veio do ingest, não do usuário"
alter table tasks
  add column if not exists last_ingest_at timestamptz;

alter table task_comments
  add column if not exists last_ingest_at timestamptz;

-- 3) status de sincronização do webhook (atualizado pelo dispatch-webhook)
alter table tasks
  add column if not exists webhook_sync_status text  -- 'synced' | 'error'
    check (webhook_sync_status in ('synced', 'error')),
  add column if not exists webhook_sync_error  text;

-- 4) Trigger task: recria com guard anti-loop.
--
--    NÃO dispara quando:
--      a) last_ingest_at mudou        → update veio do ingest-task
--      b) webhook_sync_status mudou   → dispatch-webhook atualizou o status
--      c) external_id mudou           → dispatch-webhook setou o id externo
--    Esses três cobrem todos os updates "de sistema", evitando loop.
create or replace function trg_webhook_task_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Guard anti-loop: ignora updates originados pelo ingest ou pelo próprio webhook
  if NEW.last_ingest_at is distinct from OLD.last_ingest_at then return NEW; end if;
  if NEW.webhook_sync_status is distinct from OLD.webhook_sync_status then return NEW; end if;
  if NEW.external_id is distinct from OLD.external_id then return NEW; end if;

  if NEW.external_source = 'salesforce' and NEW.external_id is not null then
    begin
      perform dispatch_webhook('task.updated', jsonb_build_object(
        'task_id',         NEW.id,
        'external_id',     NEW.external_id,
        'external_source', NEW.external_source,
        'record',          to_jsonb(NEW),
        'old_record',      to_jsonb(OLD)
      ));
    exception when others then
      update tasks set webhook_sync_status = 'error', webhook_sync_error = sqlerrm
       where id = NEW.id;
    end;
  end if;
  return NEW;
end;
$$;

-- Recria o trigger sem WHEN (a lógica está dentro da função agora)
drop trigger if exists webhook_task_update on tasks;
create trigger webhook_task_update
  after update on tasks
  for each row
  when (OLD is distinct from NEW)
  execute function trg_webhook_task_update();

-- 5) Trigger comment: recria com guard anti-loop.
create or replace function trg_webhook_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t        tasks;
  is_reply boolean;
  evt      text;
begin
  -- Guard anti-loop: ignora updates originados pelo ingest
  if TG_OP = 'UPDATE' and NEW.last_ingest_at is distinct from OLD.last_ingest_at then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and NEW.external_id is distinct from OLD.external_id then
    return NEW;
  end if;

  select * into t from tasks where id = NEW.task_id;
  if t.external_source is distinct from 'salesforce' or t.external_id is null then
    return NEW;
  end if;
  is_reply := NEW.parent_id is not null;
  evt := case
           when TG_OP = 'INSERT' and is_reply then 'reply.created'
           when TG_OP = 'INSERT'              then 'comment.created'
           when is_reply                      then 'reply.updated'
           else                                    'comment.updated'
         end;
  begin
    perform dispatch_webhook(evt, jsonb_build_object(
      'task_id',          t.id,
      'task_external_id', t.external_id,
      'is_reply',         is_reply,
      'record',           to_jsonb(NEW),
      'old_record',       case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end
    ));
  exception when others then
    null; -- webhook nunca bloqueia operação do usuário
  end;
  return NEW;
end;
$$;
