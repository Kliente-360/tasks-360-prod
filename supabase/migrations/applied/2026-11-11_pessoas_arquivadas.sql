-- Pessoas arquivadas (nov/2026)
--
-- Quem saiu da empresa não pode ser excluído (perderia o histórico de
-- tarefas, horas e comentários), mas precisa sumir das listas, seletores
-- e análises. arquivado_em marca isso; o app filtra e o acesso é revogado
-- (invited_at = null) no mesmo update. As notificações ignoram arquivados.

alter table public.pessoas add column if not exists arquivado_em timestamptz;

CREATE OR REPLACE FUNCTION public.notificar_clientes_da_task(p_task tasks, p_kind text, p_author text, p_preview text, p_comment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_task.visivel_cliente is not true
     or p_task.privada is true
     or (p_task.criado_por_ia is true and p_task.triada_em is null)
     or exists (select 1 from public.clientes c where c.id = p_task.cliente_id and c.eh_interno) then
    return;
  end if;
  insert into public.notifications
    (recipient_pessoa_id, kind, payload, source_task_id, source_comment_id)
  select p.id, p_kind,
         jsonb_build_object('author', p_author, 'task_id', p_task.id,
                            'titulo', p_task.titulo, 'preview', left(coalesce(p_preview, ''), 1000),
                            'comment_id', p_comment_id),
         p_task.id, p_comment_id
  from public.pessoas p
  where p.role = 'cliente' and p.cliente_id = p_task.cliente_id and p.arquivado_em is null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notif_comentario_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_task public.tasks;
begin
  if new.from_cliente is not true or new.kind is not null then
    return new;
  end if;
  select * into v_task from public.tasks where id = new.task_id;
  if not found then
    return new;
  end if;
  insert into public.notifications (recipient_pessoa_id, kind, payload, source_task_id, source_comment_id)
  select d.id,
         case when new.parent_id is not null then 'cliente_respondeu' else 'cliente_comentou' end,
         jsonb_build_object('author', coalesce(new.author, 'Cliente'), 'task_id', new.task_id,
                            'titulo', v_task.titulo, 'comment_id', new.id,
                            'preview', left(new.body, 200)),
         new.task_id, new.id
  from (
    select v_task.pessoa_id as id where v_task.pessoa_id is not null
    union
    select p.id from public.pessoas p
      where v_task.pessoa_id is null and p.is_pm = true and p.role in ('admin', 'interno') and p.arquivado_em is null
  ) d;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notif_nova_solicitacao_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_autor text;
  v_cliente text;
begin
  if new.criado_por_cliente is not true then
    return new;
  end if;
  select nome into v_autor from public.pessoas where id = app_pessoa_id();
  select nome into v_cliente from public.clientes where id = new.cliente_id;
  insert into public.notifications (recipient_pessoa_id, kind, payload, source_task_id)
  select p.id, 'cliente_nova_solicitacao',
         jsonb_build_object('author', coalesce(v_autor, 'Cliente'), 'cliente', v_cliente,
                            'task_id', new.id, 'titulo', new.titulo,
                            'preview', left(coalesce(new.descricao, ''), 200)),
         new.id
  from public.pessoas p
  where (p.role = 'admin' or (p.is_pm = true and p.role = 'interno')) and p.arquivado_em is null;
  return new;
end;
$function$;
