-- Padroniza o payload do webhook: identificadores ficam no top-level
-- (task_id, comment_id, is_reply); external_ids + record + flags ficam
-- dentro de `data{}`. Isso vale tanto pra task quanto pra comment.
--
-- Estrutura final do JSON enviado pelo dispatch_webhook:
--
--   task.updated:
--     {
--       "event":   "task.updated",
--       "sent_at": "<iso>",
--       "task_id": "<uuid local>",
--       "data": {
--         "task_external_id": "<external_id>",
--         "external_source":  "salesforce",
--         "record":     { ... linha NEW de tasks ... },
--         "old_record": { ... linha OLD de tasks ... }
--       }
--     }
--
--   comment.created | comment.updated | reply.created | reply.updated:
--     {
--       "event":      "<evt>",
--       "sent_at":    "<iso>",
--       "task_id":    "<uuid local da task>",
--       "comment_id": "<uuid local do comment>",
--       "is_reply":   true | false,
--       "data": {
--         "task_external_id":    "<external_id da task>",
--         "comment_external_id": "<external_id do comment, ou null no create>",
--         "parent_id":           "<uuid local do parent, ou null se top-level>",
--         "parent_external_id":  "<external_id do parent, ou null se não sincado ainda>",
--         "external_source":     "salesforce",
--         "record":     { ... linha NEW de task_comments ... },
--         "old_record": { ... linha OLD de task_comments, ou null no insert ... }
--       }
--     }
--
-- Por quê separar: identificadores são pra roteamento/lookup do consumidor
-- (Apex no SF, n8n, etc) e ficam fixos no top-level. `data` carrega tudo
-- que muda por evento.
--
-- Refatora dispatch_webhook pra aceitar (event, top_level jsonb, data jsonb).
-- ─────────────────────────────────────────────────────────────────

-- 1) Nova assinatura de dispatch_webhook. Drop da antiga + create da nova.
drop function if exists dispatch_webhook(text, jsonb);

create or replace function dispatch_webhook(
  event_type text,
  top_level  jsonb,
  data       jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg     webhook_config;
  payload jsonb;
begin
  select * into cfg from webhook_config where id = 1;
  if cfg.url is null or cfg.enabled is not true then
    return;
  end if;

  -- Envelope base + top-level mergeado + data aninhado.
  payload := jsonb_build_object(
    'event',   event_type,
    'sent_at', now()
  ) || coalesce(top_level, '{}'::jsonb) || jsonb_build_object('data', coalesce(data, '{}'::jsonb));

  perform net.http_post(
    url     := cfg.url,
    body    := payload,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || coalesce(cfg.secret, '')
               )
  );
end;
$$;

-- 2) Trigger de task: usa nova assinatura.
create or replace function trg_webhook_task_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Guards anti-loop (idem ao anterior).
  if NEW.last_ingest_at      is distinct from OLD.last_ingest_at      then return NEW; end if;
  if NEW.webhook_sync_status is distinct from OLD.webhook_sync_status then return NEW; end if;
  if NEW.external_id         is distinct from OLD.external_id         then return NEW; end if;

  if NEW.external_source = 'salesforce' and NEW.external_id is not null then
    begin
      perform dispatch_webhook('task.updated',
        jsonb_build_object(
          'task_id', NEW.id
        ),
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
$$;

-- Recria o trigger sem WHEN (a lógica está dentro da função).
drop trigger if exists webhook_task_update on tasks;
create trigger webhook_task_update
  after update on tasks
  for each row
  when (OLD is distinct from NEW)
  execute function trg_webhook_task_update();

-- 3) Trigger de comment/reply: usa nova assinatura + lookup do parent_external_id.
create or replace function trg_webhook_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t                   tasks;
  is_reply            boolean;
  evt                 text;
  parent_external_id  text;
begin
  -- Guard anti-loop: ignora updates originados pelo ingest ou pelo dispatch.
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

  -- Lookup do parent_external_id (FeedItem.Id pai no SF) quando é reply.
  -- Pode vir null se o pai ainda não foi sincado (race window curto). O
  -- consumidor precisa lidar (retry/queue) — aceitamos best-effort aqui.
  if is_reply then
    select external_id into parent_external_id
      from task_comments where id = NEW.parent_id;
  end if;

  begin
    perform dispatch_webhook(evt,
      jsonb_build_object(
        'task_id',    t.id,
        'comment_id', NEW.id,
        'is_reply',   is_reply
      ),
      jsonb_build_object(
        'task_external_id',    t.external_id,
        'comment_external_id', NEW.external_id,
        'parent_id',           NEW.parent_id,
        'parent_external_id',  parent_external_id,
        'external_source',     NEW.external_source,
        'record',              to_jsonb(NEW),
        'old_record',          case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end
      )
    );
  exception when others then
    null; -- webhook nunca bloqueia operação do usuário
  end;
  return NEW;
end;
$$;

-- Trigger de comment/reply (recria sem WHEN — lógica está na função).
drop trigger if exists webhook_comment on task_comments;
create trigger webhook_comment
  after insert or update on task_comments
  for each row
  execute function trg_webhook_comment();
