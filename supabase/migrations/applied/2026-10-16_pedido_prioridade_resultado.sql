-- Pedido de prioridade · resultado visível para o cliente (out/2026)
--
-- Antes: ao responder o pedido, o time zerava prioridade_pedida/_em e o
-- cliente só via "pedido respondido". Se o time subia a prioridade direto
-- no campo (sem o banner), o pedido ficava pendente para sempre.
--
-- Agora:
--   prioridade_pedido_em      null = nada pendente (igual antes)
--   prioridade_pedida         fica guardada após a resposta (nível pedido)
--   prioridade_pedido_resultado 'aceito' | 'mantido'
--   prioridade_pedido_respondido_em
-- Regras (trigger before update):
--   · pedido pendente e a prioridade sobe até o nível pedido (alta → P0/P1,
--     urgente → P0) → fecha como 'aceito' e avisa o cliente
--   · time fecha o pedido (pedido_em → null) → resultado conforme a
--     prioridade final; o aviso sai do comentário de resposta
-- Notificação nova: portal_prioridade_aceita.
-- Também: preview das notificações do cliente vai a 1000 caracteres
-- (motivo de recusa aparecia cortado).

alter table public.tasks
  add column if not exists prioridade_pedido_resultado text,
  add column if not exists prioridade_pedido_respondido_em timestamptz;

alter table public.tasks drop constraint if exists tasks_prioridade_pedido_resultado_check;
alter table public.tasks add constraint tasks_prioridade_pedido_resultado_check
  check (prioridade_pedido_resultado is null or prioridade_pedido_resultado in ('aceito', 'mantido'));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'mention', 'assigned', 'comment_on_my_task', 'cliente_comentou',
    'cliente_respondeu', 'status_change', 'generico',
    'cliente_aprovou', 'cliente_pediu_ajuste',
    'cliente_respondeu_pendencia', 'cliente_pediu_prioridade',
    'portal_comentario', 'portal_pendencia', 'portal_resposta_prioridade',
    'portal_homologar', 'portal_concluida', 'portal_aceita', 'portal_recusada',
    'portal_prioridade_aceita'
  ));

-- Prioridade interna atende o nível pedido pelo cliente?
create or replace function public.prioridade_atende_pedido(p_prio text, p_pedida text)
returns boolean
language sql
immutable
as $$
  select case p_pedida
    when 'urgente' then p_prio = 'P0'
    when 'alta' then p_prio in ('P0', 'P1')
    else false
  end;
$$;

create or replace function public.trg_pedido_prioridade_resultado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Novo pedido: limpa o resultado do anterior
  if new.prioridade_pedido_em is not null and old.prioridade_pedido_em is null then
    new.prioridade_pedido_resultado := null;
    new.prioridade_pedido_respondido_em := null;
    return new;
  end if;

  if old.prioridade_pedido_em is null then
    return new;
  end if;

  -- Time fechou o pedido pelo banner
  if new.prioridade_pedido_em is null then
    new.prioridade_pedida := coalesce(new.prioridade_pedida, old.prioridade_pedida);
    new.prioridade_pedido_resultado :=
      case when prioridade_atende_pedido(new.prioridade, new.prioridade_pedida) then 'aceito' else 'mantido' end;
    new.prioridade_pedido_respondido_em := now();
    return new;
  end if;

  -- Time subiu a prioridade direto no campo até o nível pedido
  if new.prioridade is distinct from old.prioridade
     and prioridade_atende_pedido(new.prioridade, new.prioridade_pedida) then
    new.prioridade_pedido_em := null;
    new.prioridade_pedido_ate := null;
    new.prioridade_pedido_resultado := 'aceito';
    new.prioridade_pedido_respondido_em := now();
    perform notificar_clientes_da_task(new, 'portal_prioridade_aceita', 'Kliente 360', '', null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pedido_prioridade_resultado on public.tasks;
create trigger trg_pedido_prioridade_resultado
  before update of prioridade, prioridade_pedido_em, prioridade_pedida on public.tasks
  for each row execute function public.trg_pedido_prioridade_resultado();

-- Resposta pelo banner: aviso diz se foi aceito
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
    when 'resposta_prioridade' then
      case when v_task.prioridade_pedido_resultado = 'aceito'
        then 'portal_prioridade_aceita' else 'portal_resposta_prioridade' end
    else 'portal_comentario'
  end;
  perform notificar_clientes_da_task(v_task, v_kind, coalesce(new.author, 'Kliente 360'), new.body, new.id);
  return new;
end;
$$;

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
                            'titulo', p_task.titulo, 'preview', left(coalesce(p_preview, ''), 1000),
                            'comment_id', p_comment_id),
         p_task.id, p_comment_id
  from public.pessoas p
  where p.role = 'cliente' and p.cliente_id = p_task.cliente_id;
end;
$$;
