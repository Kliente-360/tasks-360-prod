-- Aviso ao time quando o cliente abre uma solicitação pelo portal (out/2026).
-- Destinatários: PMs e admins (quem faz a triagem).

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'mention', 'assigned', 'comment_on_my_task', 'cliente_comentou',
    'cliente_respondeu', 'status_change', 'generico',
    'cliente_aprovou', 'cliente_pediu_ajuste',
    'cliente_respondeu_pendencia', 'cliente_pediu_prioridade',
    'cliente_nova_solicitacao',
    'portal_comentario', 'portal_pendencia', 'portal_resposta_prioridade',
    'portal_homologar', 'portal_concluida', 'portal_aceita', 'portal_recusada',
    'portal_prioridade_aceita'
  ));

create or replace function public.trg_notif_nova_solicitacao_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
  where p.role = 'admin' or (p.is_pm = true and p.role = 'interno');
  return new;
end;
$$;

drop trigger if exists trg_notif_nova_solicitacao_cliente on public.tasks;
create trigger trg_notif_nova_solicitacao_cliente
  after insert on public.tasks
  for each row execute function public.trg_notif_nova_solicitacao_cliente();
