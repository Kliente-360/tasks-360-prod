-- Webhook de saída pra eventos de tasks com vínculo Salesforce.
--
-- Dispara um POST JSON pra uma URL configurável quando:
--   - uma task com external_source='salesforce' é ATUALIZADA
--   - um comentário é CRIADO ou EDITADO numa task SF
--   - uma resposta de comentário é CRIADA ou EDITADA numa task SF
--
-- Implementado em trigger + pg_net — assíncrono, NÃO bloqueia o save.
-- Só dispara pra tasks com external_id Salesforce (filtro no banco).
--
-- ─────────────────────────────────────────────────────────────────
-- COMO LIGAR (depois que tiver a URL de destino):
--   update webhook_config
--      set url = 'https://SUA-URL-AQUI',
--          secret = 'algum-token-opcional'   -- vai no header X-Webhook-Secret
--    where id = 1;
-- COMO DESLIGAR temporariamente:
--   update webhook_config set enabled = false where id = 1;
-- DEBUG (ver respostas das entregas):
--   select * from net._http_response order by created desc limit 20;
-- ─────────────────────────────────────────────────────────────────
--
-- Pré-requisito: extensão pg_net habilitada (Database > Extensions).
-- Já está ligada — é usada pelo cron de cleanup de anexos.

-- 1) Config singleton. url NULL = webhook desligado (no-op silencioso).
create table if not exists webhook_config (
  id      int     primary key default 1 check (id = 1),
  url     text,
  secret  text,
  enabled boolean not null default true
);
insert into webhook_config (id) values (1) on conflict (id) do nothing;

-- Sem policies de RLS: só o service_role (SQL Editor) lê/escreve.
-- O app cliente nunca toca essa tabela.
alter table webhook_config enable row level security;

-- 2) Dispatch helper — lê a config e faz o POST via pg_net.
--    security definer: lê webhook_config e chama net.* sem depender de RLS.
create or replace function dispatch_webhook(event_type text, data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg webhook_config;
begin
  select * into cfg from webhook_config where id = 1;
  if cfg.url is null or cfg.enabled is not true then
    return;  -- desligado / sem URL ainda
  end if;
  perform net.http_post(
    url     := cfg.url,
    body    := jsonb_build_object(
                 'event',   event_type,
                 'sent_at', now(),
                 'data',    data
               ),
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'X-Webhook-Secret', coalesce(cfg.secret, '')
               )
  );
end;
$$;

-- 3) Trigger: task SF atualizada → 'task.updated'.
create or replace function trg_webhook_task_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.external_source = 'salesforce' and NEW.external_id is not null then
    perform dispatch_webhook('task.updated', jsonb_build_object(
      'task_id',         NEW.id,
      'external_id',     NEW.external_id,
      'external_source', NEW.external_source,
      'record',          to_jsonb(NEW),
      'old_record',      to_jsonb(OLD)
    ));
  end if;
  return NEW;
end;
$$;

drop trigger if exists webhook_task_update on tasks;
create trigger webhook_task_update
  after update on tasks
  for each row
  when (OLD is distinct from NEW)   -- ignora UPDATE no-op
  execute function trg_webhook_task_update();

-- 4) Trigger: comentário/resposta criado ou editado em task SF.
--    Cobre comentário e resposta (resposta = comment com parent_id).
--    Eventos: comment.created · comment.updated · reply.created · reply.updated
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
  select * into t from tasks where id = NEW.task_id;
  -- só tasks com vínculo Salesforce
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
  perform dispatch_webhook(evt, jsonb_build_object(
    'task_id',          t.id,
    'task_external_id', t.external_id,
    'is_reply',         is_reply,
    'record',           to_jsonb(NEW),
    'old_record',       case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end
  ));
  return NEW;
end;
$$;

drop trigger if exists webhook_comment_insert on task_comments;
create trigger webhook_comment_insert
  after insert on task_comments
  for each row
  execute function trg_webhook_comment();

drop trigger if exists webhook_comment_update on task_comments;
create trigger webhook_comment_update
  after update on task_comments
  for each row
  when (OLD is distinct from NEW)
  execute function trg_webhook_comment();
