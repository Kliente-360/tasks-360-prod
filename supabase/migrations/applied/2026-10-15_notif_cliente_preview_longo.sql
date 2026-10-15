-- Aviso de recusa leva a mensagem do time pro cliente: preview 80 → 300.
create or replace function public.notificar_clientes_da_task(
  p_task public.tasks,
  p_kind text,
  p_author text,
  p_preview text,
  p_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_task.visivel_cliente is not true
     or p_task.privada is true
     or exists (select 1 from public.clientes c where c.id = p_task.cliente_id and c.eh_interno) then
    return;
  end if;
  insert into public.notifications
    (recipient_pessoa_id, kind, payload, source_task_id, source_comment_id)
  select p.id, p_kind,
         jsonb_build_object('author', p_author, 'task_id', p_task.id,
                            'titulo', p_task.titulo, 'preview', left(coalesce(p_preview, ''), 300),
                            'comment_id', p_comment_id),
         p_task.id, p_comment_id
  from public.pessoas p
  where p.role = 'cliente' and p.cliente_id = p_task.cliente_id;
end;
$$;
revoke all on function public.notificar_clientes_da_task(public.tasks, text, text, text, uuid)
  from public, anon, authenticated;
