-- ============================================================
-- Salesforce webhook · restaura triggers (chamada errada → 2 args
-- vs 3 args da função dispatch_webhook)
-- ============================================================
--
-- Bug: função `dispatch_webhook(text, jsonb, jsonb)` foi atualizada
-- pra contrato v2 (top_level separado de data), mas os triggers
-- continuaram chamando com 2 args. Postgres não faz overload entre
-- assinaturas — toda task SF salva no app falhava com:
--   "function dispatch_webhook(unknown, jsonb) does not exist"
--
-- Acumulou 24 tasks com webhook_sync_status='error' entre 03/06 e
-- 10/06 (data desta migration).
--
-- Fix: recria os 2 trigger functions chamando com 3 args (event,
-- top_level, data) respeitando o contrato v2 do edge function
-- `dispatch-webhook`. Lookup de parent_external_id adicionado pro
-- comment trigger (campo que o edge espera receber em data).
--
-- Idempotente: CREATE OR REPLACE garante re-run sem efeito colateral.

-- ─── 1. Trigger function · task.updated ────────────────────────
create or replace function public.trg_webhook_task_update()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  is_enabled boolean;
begin
  -- Anti-loop: external_id ou webhook_sync_status mudaram → veio do
  -- próprio callback do dispatch-webhook. Pula.
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
      -- Contrato v2: identificadores top_level + dados no data.
      perform dispatch_webhook(
        'task.updated',
        jsonb_build_object('task_id', NEW.id),
        jsonb_build_object(
          'task_external_id', NEW.external_id,
          'external_source',  NEW.external_source,
          'record',           to_jsonb(NEW),
          'old_record',       to_jsonb(OLD)
        )
      );
    exception when others then
      update tasks set webhook_sync_status = 'error', webhook_sync_error = sqlerrm
       where id = NEW.id;
    end;
  end if;
  return NEW;
end;
$function$;

-- ─── 2. Trigger function · comment.created/updated + reply ────
create or replace function public.trg_webhook_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  t          record;
  evt        text;
  is_enabled boolean;
  parent_ext text;
begin
  -- Anti-loop: external_id mudou (callback do dispatch setou)
  if TG_OP = 'UPDATE' and NEW.external_id is distinct from OLD.external_id then
    return NEW;
  end if;

  -- Gate 1: visivel_cliente = true · comments internos não integram com SF
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

  -- Lookup parent_external_id pra reply (edge function precisa receber
  -- o external_id do comment pai, não o uuid interno).
  parent_ext := null;
  if NEW.parent_id is not null then
    select external_id into parent_ext from task_comments where id = NEW.parent_id;
  end if;

  begin
    -- Contrato v2: identificadores top_level + dados no data.
    perform dispatch_webhook(
      evt,
      jsonb_build_object(
        'task_id',    NEW.task_id,
        'comment_id', NEW.id,
        'is_reply',   NEW.parent_id is not null
      ),
      jsonb_build_object(
        'task_external_id',    t.external_id,
        'comment_external_id', NEW.external_id,
        'parent_id',           NEW.parent_id,
        'parent_external_id',  parent_ext,
        'external_source',     t.external_source,
        'record',              to_jsonb(NEW),
        'old_record',          case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end
      )
    );
  exception when others then
    null; -- webhook nunca bloqueia operação do usuário
  end;
  return NEW;
end;
$function$;

-- ─── 3. Recovery · zera as 24 tasks que falharam só pelo bug ───
-- Limpa webhook_sync_status/error nas tasks com erro causado pelo
-- mismatch de assinatura. O próximo save no app re-dispara o webhook
-- automaticamente. NÃO disparamos em massa pra não inundar SF.
update tasks
set webhook_sync_status = null,
    webhook_sync_error  = null
where webhook_sync_error like '%function dispatch_webhook%does not exist%';

-- ─── 4. Verificação manual sugerida ─────────────────────────────
-- Conferir que as 2 trigger functions foram recriadas com a chamada
-- de 3 args:
--   select pg_get_functiondef(p.oid) from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public' and p.proname in
--     ('trg_webhook_task_update','trg_webhook_comment');
--
-- Esperado: `perform dispatch_webhook('event', jsonb_build_object(...), jsonb_build_object(...))`
-- em ambos.
