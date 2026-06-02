-- Gate dispatch_webhook pelos clientes cujo webhook_enabled = true (VB / CTF).
--
-- Problema: a função trg_webhook_task_update originalmente disparava
-- dispatch_webhook pra QUALQUER task com external_source='salesforce' +
-- external_id is not null. Mas só VB e CTF têm credenciais cadastradas
-- na edge function — qualquer outra task SF dispara, falha por falta
-- de credencial, gera webhook_sync_status='error' e toasta "Falha ao
-- sincronizar" pro usuário ao editar.
--
-- Fix: adicionar gate `(select webhook_enabled from clientes where id =
-- NEW.cliente_id)` antes do dispatch. Aplica a tasks e comments.
--
-- Reverte: rodar a versão anterior do trigger (sem o gate por
-- webhook_enabled) — ver migration 2026-05-22_webhook_payload_v2.sql.

-- ============ Tasks ============
create or replace function trg_webhook_task_update()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_enabled boolean;
begin
  -- Guard anti-loop: ignora updates originados pelo ingest ou pelo próprio webhook
  if NEW.external_id is distinct from OLD.external_id then return NEW; end if;
  if NEW.webhook_sync_status is distinct from OLD.webhook_sync_status then return NEW; end if;

  -- Só dispara pra tasks que vieram do Salesforce
  if NEW.external_source = 'salesforce' and NEW.external_id is not null then
    -- Gate por cliente: VB/CTF têm webhook_enabled=true; demais ignoram
    select webhook_enabled into is_enabled from clientes where id = NEW.cliente_id;
    if not coalesce(is_enabled, false) then
      return NEW;
    end if;

    begin
      perform dispatch_webhook('task.updated', jsonb_build_object(
        'task_id',         NEW.id,
        'task_external_id', NEW.external_id,
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

-- ============ Comments / Replies ============
create or replace function trg_webhook_comment()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  t record;
  evt text;
  is_enabled boolean;
begin
  -- Guard anti-loop
  if TG_OP = 'UPDATE' and NEW.external_id is distinct from OLD.external_id then
    return NEW;
  end if;

  select id, cliente_id, external_source, external_id into t
    from tasks where id = NEW.task_id;

  if t.external_source is distinct from 'salesforce' or t.external_id is null then
    return NEW;
  end if;

  -- Gate por cliente: só VB/CTF
  select webhook_enabled into is_enabled from clientes where id = t.cliente_id;
  if not coalesce(is_enabled, false) then
    return NEW;
  end if;

  evt := case
    when TG_OP = 'INSERT' and NEW.parent_id is not null then 'reply.created'
    when TG_OP = 'INSERT' then 'comment.created'
    when TG_OP = 'UPDATE' and NEW.parent_id is not null then 'reply.updated'
    else 'comment.updated'
  end;

  begin
    perform dispatch_webhook(evt, jsonb_build_object(
      'task_id',             NEW.task_id,
      'comment_id',          NEW.id,
      'is_reply',            NEW.parent_id is not null,
      'task_external_id',    t.external_id,
      'comment_external_id', NEW.external_id,
      'parent_id',           NEW.parent_id,
      'external_source',     t.external_source,
      'record',              to_jsonb(NEW),
      'old_record',          case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end
    ));
  exception when others then
    null; -- webhook nunca bloqueia operação do usuário
  end;
  return NEW;
end;
$$;

-- Conferir clientes que têm webhook habilitado (deve ser só VB e CTF):
-- select id, nome, webhook_enabled from clientes where webhook_enabled = true;
