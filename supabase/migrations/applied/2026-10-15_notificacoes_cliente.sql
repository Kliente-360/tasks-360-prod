-- Notificações para o cliente no portal (out/2026)
--
-- Destinatários: todos os usuários (role 'cliente') do cliente da task.
-- Gerado no banco (triggers), não importa qual tela do time fez a mudança.
-- Só tasks visíveis ao cliente, não privadas, de cliente externo.
--
-- Eventos:
--   portal_comentario          time escreveu (comentário visível ao cliente)
--   portal_pendencia           time bloqueou com uma pergunta pro cliente
--   portal_resposta_prioridade time respondeu o pedido de prioridade
--   portal_homologar           task entrou em homologação
--   portal_concluida           task concluída
--   portal_aceita / portal_recusada   solicitação do cliente triada

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'mention', 'assigned', 'comment_on_my_task', 'cliente_comentou',
    'cliente_respondeu', 'status_change', 'generico',
    'cliente_aprovou', 'cliente_pediu_ajuste',
    'cliente_respondeu_pendencia', 'cliente_pediu_prioridade',
    'portal_comentario', 'portal_pendencia', 'portal_resposta_prioridade',
    'portal_homologar', 'portal_concluida', 'portal_aceita', 'portal_recusada'
  ));

-- Envia uma notificação a cada usuário do cliente da task
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
                            'titulo', p_task.titulo, 'preview', left(coalesce(p_preview, ''), 80),
                            'comment_id', p_comment_id),
         p_task.id, p_comment_id
  from public.pessoas p
  where p.role = 'cliente' and p.cliente_id = p_task.cliente_id;
end;
$$;
revoke all on function public.notificar_clientes_da_task(public.tasks, text, text, text, uuid)
  from public, anon, authenticated;

-- Comentários do time que ficam visíveis ao cliente (no insert ou quando
-- um comentário interno passa a ser visível)
create or replace function public.trg_notif_cliente_comentario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_kind text;
begin
  if new.visivel_cliente is not true or new.from_cliente is true then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.visivel_cliente is true then
    return new;
  end if;
  select * into v_task from public.tasks where id = new.task_id;
  if not found or v_task.arquivado_em is not null then
    return new;
  end if;
  v_kind := case new.kind
    when 'pendencia' then 'portal_pendencia'
    when 'resposta_prioridade' then 'portal_resposta_prioridade'
    else 'portal_comentario'
  end;
  perform notificar_clientes_da_task(v_task, v_kind, coalesce(new.author, 'Kliente 360'), new.body, new.id);
  return new;
end;
$$;

drop trigger if exists trg_notif_cliente_comentario on public.task_comments;
create trigger trg_notif_cliente_comentario
  after insert or update of visivel_cliente on public.task_comments
  for each row execute function public.trg_notif_cliente_comentario();

-- Mudanças de etapa e triagem
create or replace function public.trg_notif_cliente_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Triagem de solicitação aberta pelo cliente
  if new.criado_por_cliente is true and old.triada_em is null and new.triada_em is not null then
    if new.arquivado_em is not null then
      perform notificar_clientes_da_task(new, 'portal_recusada', 'Kliente 360',
        coalesce(new.motivo_arquivamento, ''), null);
    else
      perform notificar_clientes_da_task(new, 'portal_aceita', 'Kliente 360', '', null);
    end if;
    return new;
  end if;

  if new.arquivado_em is not null then
    return new;
  end if;

  if new.subetapa = 'em_homologacao' and old.subetapa is distinct from 'em_homologacao' then
    perform notificar_clientes_da_task(new, 'portal_homologar', 'Kliente 360', '', null);
  elsif new.status = 'concluido' and old.status is distinct from 'concluido' then
    perform notificar_clientes_da_task(new, 'portal_concluida', 'Kliente 360', '', null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notif_cliente_task on public.tasks;
create trigger trg_notif_cliente_task
  after update of subetapa, status, triada_em on public.tasks
  for each row execute function public.trg_notif_cliente_task();
