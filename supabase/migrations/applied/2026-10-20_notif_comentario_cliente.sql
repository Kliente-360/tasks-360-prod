-- Aviso ao time quando o cliente comenta no portal (out/2026)
-- O portal gravava a notificação pelo navegador com `void sb...insert()`,
-- que nunca executava (o builder do Supabase só roda quando aguardado).
-- Agora o banco avisa: responsável da task; sem responsável, os PMs.
-- Comentários com kind (pendência, ajuste, prioridade…) já avisam pelas RPCs.

create or replace function public.trg_notif_comentario_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
      where v_task.pessoa_id is null and p.is_pm = true and p.role in ('admin', 'interno')
  ) d;
  return new;
end;
$$;

drop trigger if exists trg_notif_comentario_cliente on public.task_comments;
create trigger trg_notif_comentario_cliente
  after insert on public.task_comments
  for each row execute function public.trg_notif_comentario_cliente();
