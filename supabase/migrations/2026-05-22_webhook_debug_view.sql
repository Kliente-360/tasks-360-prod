-- View de debug do webhook outbound (tasks 360 → Salesforce).
--
-- Mostra cada disparo recente do dispatch-webhook (via pg_net) já cruzado
-- com a task associada e o cliente. Pra task events resolve direto pelo
-- response.id; pra comment/reply events resolve indiretamente via
-- task_comments.task_id.
--
-- USO RÁPIDO no SQL Editor:
--
--   -- últimos 50 disparos com tudo:
--   select * from webhook_debug_recent order by dispatched_at desc limit 50;
--
--   -- só erros da última hora:
--   select * from webhook_debug_recent
--    where dispatched_at > now() - interval '1 hour'
--      and (upstream_status >= 400 or net_error is not null);
--
--   -- filtra por cliente:
--   select * from webhook_debug_recent where cliente ilike '%vb%';
--
-- O QUE ESSA VIEW NÃO MOSTRA:
-- - Payload enviado pra dispatch-webhook (vive em net.http_request_queue
--   antes do response chegar; após processado, payload é descartado).
-- - Payload enviado pelo dispatch-webhook pro Salesforce.
-- - Resposta crua do Salesforce.
-- Pra esses 3, ver os logs da edge function (console.log).
-- ─────────────────────────────────────────────────────────────────

create or replace view webhook_debug_recent as
with recent_responses as (
  select
    r.id,
    r.created,
    r.status_code,
    r.error_msg,
    r.content,
    -- O body que dispatch-webhook devolveu (JSON {action, table, id, ...}).
    nullif(r.content, '')::jsonb                       as body_json
  from net._http_response r
  where r.created > now() - interval '7 days'
),
parsed as (
  select
    rr.id,
    rr.created,
    rr.status_code,
    rr.error_msg,
    rr.content,
    rr.body_json ->> 'action'                          as acao,
    rr.body_json ->> 'table'                           as tabela_alvo,
    rr.body_json ->> 'external_id'                     as external_id_recebido,
    (rr.body_json ->> 'external_id_was_already_set')::boolean as ext_id_ja_existia,
    case
      when (rr.body_json ->> 'table') in ('tasks', 'task_comments')
        then (rr.body_json ->> 'id')::uuid
      else null
    end                                                as registro_id
  from recent_responses rr
)
select
  p.id                                                  as response_id,
  p.created                                             as dispatched_at,
  p.status_code                                         as upstream_status,
  p.acao,
  p.tabela_alvo,
  p.registro_id,
  -- Task associada — direta (tabela_alvo='tasks') ou via parent_id (tabela_alvo='task_comments')
  coalesce(t.titulo, t_via_comment.titulo)              as task_titulo,
  coalesce(t.external_id, t_via_comment.external_id)    as task_external_id,
  coalesce(t.webhook_sync_status,
           t_via_comment.webhook_sync_status)           as webhook_sync_status,
  coalesce(t.webhook_sync_error,
           t_via_comment.webhook_sync_error)            as webhook_sync_error,
  c.nome                                                as cliente,
  p.external_id_recebido,
  p.ext_id_ja_existia,
  p.error_msg                                           as net_error,
  left(p.content, 300)                                  as response_preview
from parsed p
left join tasks         t              on t.id = p.registro_id and p.tabela_alvo = 'tasks'
left join task_comments tc             on tc.id = p.registro_id and p.tabela_alvo = 'task_comments'
left join tasks         t_via_comment  on t_via_comment.id = tc.task_id
left join clientes      c              on c.id = coalesce(t.cliente_id, t_via_comment.cliente_id)
order by p.created desc;

comment on view webhook_debug_recent is
  'Últimos 7 dias de disparos do dispatch-webhook cruzados com tasks/clientes. Pra payload enviado/resposta do SF, ver logs da edge function.';
