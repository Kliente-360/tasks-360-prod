-- Adiciona guard de INSERT no trigger trg_webhook_comment.
--
-- Hoje o guard anti-loop só cobre UPDATE (compara NEW.last_ingest_at vs
-- OLD.last_ingest_at). Em INSERT, OLD é null, então a comparação não
-- protege. Resultado: comments inseridos pelo ingest-comment (e pelo
-- novo auto-comment do ingest-task ao arquivar/desarquivar via SF) eram
-- ecoados de volta pro SF — loop.
--
-- Convenção: qualquer comment originado por sistema interno deve setar
-- last_ingest_at no payload de INSERT. A trigger detecta e suprime o
-- webhook de saída.
-- ─────────────────────────────────────────────────────────────────

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
  -- Guard anti-loop UPDATE: ignora updates originados pelo ingest/dispatch.
  if TG_OP = 'UPDATE' and NEW.last_ingest_at is distinct from OLD.last_ingest_at then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and NEW.external_id is distinct from OLD.external_id then
    return NEW;
  end if;
  -- Guard anti-loop INSERT: comment inserido por sistema (ingest-comment
  -- ou auto-comment do ingest-task) seta last_ingest_at. Não dispara
  -- webhook de saída — SF é quem originou a ação.
  if TG_OP = 'INSERT' and NEW.last_ingest_at is not null then
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
