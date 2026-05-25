-- Atualiza o webhook SF pra usar a Edge Function "dispatch-webhook" como
-- intermediário, em vez de chamar a URL externa diretamente.
--
-- Nova arquitetura:
--   DB trigger → pg_net → Edge Function dispatch-webhook
--                              → fetch(WEBHOOK_URL_TASK | WEBHOOK_URL_COMMENT)
--                              → lê external_id da resposta
--                              → UPDATE tasks / task_comments
--
-- Configuração (SQL Editor):
--   update webhook_config
--      set url    = 'https://<project-ref>.supabase.co/functions/v1/dispatch-webhook',
--          secret = '<DISPATCH_WEBHOOK_SECRET>'   -- mesmo valor do secret da Edge Function
--    where id = 1;
--
-- Secrets da Edge Function (Edge Functions > Settings > Secrets):
--   DISPATCH_WEBHOOK_SECRET  — token Bearer validado pela função
--   WEBHOOK_URL_TASK         — URL do sistema externo pra task.updated
--   WEBHOOK_URL_COMMENT      — URL do sistema externo pra comment.*/reply.*
--
-- ─────────────────────────────────────────────────────────────────

-- Recria dispatch_webhook() enviando o secret como Authorization: Bearer
-- (pg_net não tem header Authorization nativo — usamos o campo headers JSONB).
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
    return;
  end if;
  perform net.http_post(
    url     := cfg.url,
    body    := jsonb_build_object(
                 'event',   event_type,
                 'sent_at', now(),
                 'data',    data
               ),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || coalesce(cfg.secret, '')
               )
  );
end;
$$;
