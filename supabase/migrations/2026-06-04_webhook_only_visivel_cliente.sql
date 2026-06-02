-- Webhook de comments: enviar pra VB/CTF SOMENTE comments marcados como
-- visivel_cliente = true. Internal notes (visivel_cliente=false) ficam
-- contidos dentro do tasks-360 e NÃO vão pro Salesforce.
--
-- Comments from_cliente=true (resposta do cliente via portal) já vêm com
-- visivel_cliente=true (lógica do portal-task-modal.tsx setando ambos),
-- então o gate único por visivel_cliente cobre os dois lados:
--   - Time interno marca "visível pro cliente" → integra
--   - Cliente responde no portal → from_cliente=true E visivel_cliente=true → integra
--   - Time interno sem marcar visível → fica interno, não integra
--
-- Reverter: rodar a versão anterior da função (migration
-- 2026-06-04_webhook_gate_by_cliente_enabled.sql · trg_webhook_comment
-- sem o check de visivel_cliente).

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
  -- Guard anti-loop: external_id mudou (foi o próprio dispatch que setou)
  if TG_OP = 'UPDATE' and NEW.external_id is distinct from OLD.external_id then
    return NEW;
  end if;

  -- Gate 1: visivel_cliente = true (NOVO · 2026-06-04)
  -- Comments internos (visivel_cliente=false) não integram com SF.
  if not coalesce(NEW.visivel_cliente, false) then
    return NEW;
  end if;

  -- Gate 2: task originada do Salesforce
  select id, cliente_id, external_source, external_id into t
    from tasks where id = NEW.task_id;

  if t.external_source is distinct from 'salesforce' or t.external_id is null then
    return NEW;
  end if;

  -- Gate 3: cliente com webhook_enabled (VB/CTF apenas)
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

-- Sanity check pós-rodagem:
-- select id, body, visivel_cliente, from_cliente, external_id
--   from comments
--  where task_id in (select id from tasks where external_source='salesforce')
--  order by criado_em desc limit 20;
