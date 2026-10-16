-- Portal · task criada por IA só aparece para o cliente depois da triagem
-- (out/2026). Antes, sugestões da IA ainda não aprovadas pelo time já
-- apareciam no portal. Solicitações abertas pelo próprio cliente continuam
-- visíveis para ele desde o envio.

drop policy if exists tasks_cliente_select on public.tasks;
create policy tasks_cliente_select on public.tasks
  for select
  using (
    app_pessoa_role() = 'cliente'
    and cliente_id = app_pessoa_cliente_id()
    and visivel_cliente = true
    and not (criado_por_ia is true and triada_em is null)
  );

drop policy if exists task_comments_cliente_select on public.task_comments;
create policy task_comments_cliente_select on public.task_comments
  for select
  using (
    app_pessoa_role() = 'cliente'
    and visivel_cliente = true
    and exists (
      select 1 from public.tasks tk
      where tk.id = task_comments.task_id
        and tk.cliente_id = app_pessoa_cliente_id()
        and tk.visivel_cliente = true
        and not (tk.criado_por_ia is true and tk.triada_em is null)
    )
  );

-- Avisos ao cliente também esperam a triagem
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
  where p.role = 'cliente' and p.cliente_id = p_task.cliente_id;
end;
$$;
