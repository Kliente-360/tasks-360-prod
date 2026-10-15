-- Responder pendência não move mais a etapa (out/2026).
-- A resposta do cliente fica registrada e o time é avisado; o time decide
-- se desbloqueia. tasks.pendencia_respondida_em marca que o cliente já
-- respondeu (some o "aguardando você" do portal). É limpa quando a task
-- sai de bloqueado (trigger) ou quando o time faz nova pergunta (app).

alter table public.tasks add column if not exists pendencia_respondida_em timestamptz;

create or replace function public.clear_bloqueado_por_on_unblock()
 returns trigger
 language plpgsql
as $function$
begin
  if new.subetapa <> 'bloqueado' then
    new.bloqueado_por := null;
    new.pendencia_respondida_em := null;
  end if;
  return new;
end$function$;

create or replace function public.app_responder_pendencia(p_task_id uuid, p_body text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
begin
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Escreva sua resposta';
  end if;
  v_task := app_portal_task_do_cliente(p_task_id);
  if v_task.subetapa <> 'bloqueado' or v_task.bloqueado_por is distinct from 'cliente' then
    raise exception 'Esta tarefa não está aguardando você';
  end if;
  update public.tasks set pendencia_respondida_em = now() where id = p_task_id;
  perform app_portal_registrar(v_task, 'resposta_pendencia', trim(p_body),
    'cliente_respondeu_pendencia', trim(p_body), null, null, false);
  return v_task.subetapa;
end;
$$;

grant execute on function public.app_responder_pendencia(uuid, text) to authenticated;
