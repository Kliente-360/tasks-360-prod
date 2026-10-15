-- Portal cliente · ações do cliente no modal (out/2026)
--
-- 1. task_comments.kind: marca comentários com papel especial no fluxo
--    (pendência do time, resposta do cliente, pedido de prioridade etc.)
-- 2. Prioridade solicitada aceita 'urgente' + pedido pendente na task
-- 3. Novos tipos de notificação pro time
-- 4. RPCs security definer pras ações do cliente (RLS de cliente em tasks
--    é só SELECT): aprovar, pedir ajuste, responder pendência, pedir
--    prioridade. Cada uma grava comentário + histórico + notificação.

-- 1 ─────────────────────────────────────────────────────────────────
alter table public.task_comments add column if not exists kind text;
alter table public.task_comments drop constraint if exists task_comments_kind_check;
alter table public.task_comments add constraint task_comments_kind_check
  check (kind is null or kind in (
    'pendencia', 'resposta_pendencia', 'pedido_prioridade',
    'resposta_prioridade', 'ajuste_solicitado', 'aprovacao'
  ));

-- 2 ─────────────────────────────────────────────────────────────────
alter table public.tasks drop constraint if exists tasks_prio_solicitada_check;
alter table public.tasks add constraint tasks_prio_solicitada_check
  check (prioridade_solicitada_cliente is null
         or prioridade_solicitada_cliente in ('urgente', 'alta', 'media', 'baixa'));
alter table public.tasks add column if not exists prioridade_pedido_em timestamptz;
alter table public.tasks add column if not exists prioridade_pedido_ate date;
create index if not exists tasks_prioridade_pedido_idx
  on public.tasks (prioridade_pedido_em) where prioridade_pedido_em is not null;

-- 3 ─────────────────────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'mention', 'assigned', 'comment_on_my_task', 'cliente_comentou',
    'cliente_respondeu', 'status_change', 'generico',
    'cliente_aprovou', 'cliente_pediu_ajuste',
    'cliente_respondeu_pendencia', 'cliente_pediu_prioridade'
  ));

-- 4 ─────────────────────────────────────────────────────────────────
-- Valida que o caller é cliente e a task é dele e visível. Devolve a task.
create or replace function public.app_portal_task_do_cliente(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
begin
  if app_pessoa_role() is distinct from 'cliente' then
    raise exception 'Ação disponível só para o cliente';
  end if;
  select * into v_task from public.tasks
    where id = p_task_id
      and cliente_id = app_pessoa_cliente_id()
      and visivel_cliente = true
      and arquivado_em is null;
  if not found then
    raise exception 'Tarefa não encontrada';
  end if;
  return v_task;
end;
$$;

-- Comentário + histórico + notificação em um lugar só.
create or replace function public.app_portal_registrar(
  p_task public.tasks,
  p_kind text,
  p_body text,
  p_notif_kind text,
  p_preview text,
  p_sub_de text,
  p_sub_para text,
  p_notificar_pms boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor text;
  v_comment_id uuid;
  v_dest uuid;
begin
  select nome into v_autor from public.pessoas where id = app_pessoa_id();
  v_autor := coalesce(v_autor, 'Cliente');

  insert into public.task_comments
    (task_id, author, author_pessoa_id, body, visivel_cliente, from_cliente, posted_em, kind)
  values
    (p_task.id, v_autor, null, p_body, true, true, now(), p_kind)
  returning id into v_comment_id;

  if p_sub_para is not null and p_sub_para is distinct from p_sub_de then
    insert into public.task_field_history (task_id, field, from_value, to_value, actor_pessoa_id, actor_source)
    values (p_task.id, 'subetapa', p_sub_de, p_sub_para, app_pessoa_id(), 'portal');
  end if;

  for v_dest in
    select p_task.pessoa_id where p_task.pessoa_id is not null
    union
    select p.id from public.pessoas p
      where p_notificar_pms and p.is_pm = true and p.role in ('admin', 'interno')
  loop
    insert into public.notifications
      (recipient_pessoa_id, kind, payload, source_task_id, source_comment_id)
    values
      (v_dest, p_notif_kind,
       jsonb_build_object('author', v_autor, 'task_id', p_task.id,
                          'comment_id', v_comment_id, 'preview', left(p_preview, 80)),
       p_task.id, v_comment_id);
  end loop;
end;
$$;

-- Aprovar entrega · em_homologacao → pronto_producao
create or replace function public.app_aprovar_entrega(p_task_id uuid)
returns timestamp with time zone
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_now timestamptz := now();
  v_para text;
begin
  v_task := app_portal_task_do_cliente(p_task_id);
  if v_task.subetapa not in ('em_homologacao', 'em_revisao', 'pronto_producao', 'em_implantacao') then
    raise exception 'Esta tarefa não está aguardando aprovação';
  end if;
  v_para := case when v_task.subetapa = 'em_homologacao' then 'pronto_producao' else v_task.subetapa end;
  update public.tasks
    set aprovado_em = coalesce(aprovado_em, v_now),
        subetapa    = v_para,
        subetapa_em = case when v_para <> v_task.subetapa then v_now else subetapa_em end
    where id = p_task_id;
  perform app_portal_registrar(v_task, 'aprovacao', 'Aprovou a entrega.',
    'cliente_aprovou', 'Aprovou a entrega', v_task.subetapa, v_para, false);
  return v_now;
end;
$$;

-- Pedir ajuste · em_homologacao → em_revisao, com comentário obrigatório
create or replace function public.app_pedir_ajuste(p_task_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
begin
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Descreva o ajuste';
  end if;
  v_task := app_portal_task_do_cliente(p_task_id);
  if v_task.subetapa <> 'em_homologacao' then
    raise exception 'Esta tarefa não está em homologação';
  end if;
  update public.tasks
    set subetapa = 'em_revisao', subetapa_em = now()
    where id = p_task_id;
  perform app_portal_registrar(v_task, 'ajuste_solicitado', trim(p_body),
    'cliente_pediu_ajuste', trim(p_body), v_task.subetapa, 'em_revisao', false);
end;
$$;

-- Responder pendência · bloqueado por cliente → volta pra etapa anterior
-- ao bloqueio (pelo histórico). Sem histórico, fica bloqueada e o time
-- decide; o comentário e a notificação saem de qualquer forma.
create or replace function public.app_responder_pendencia(p_task_id uuid, p_body text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_antes text;
begin
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Escreva sua resposta';
  end if;
  v_task := app_portal_task_do_cliente(p_task_id);
  if v_task.subetapa <> 'bloqueado' or v_task.bloqueado_por is distinct from 'cliente' then
    raise exception 'Esta tarefa não está aguardando você';
  end if;
  select h.from_value into v_antes
    from public.task_field_history h
    where h.task_id = p_task_id and h.field = 'subetapa' and h.to_value = 'bloqueado'
      and h.from_value is not null and h.from_value <> 'bloqueado'
    order by h.occurred_at desc
    limit 1;
  if v_antes is not null then
    update public.tasks
      set subetapa = v_antes, subetapa_em = now()
      where id = p_task_id;
  end if;
  perform app_portal_registrar(v_task, 'resposta_pendencia', trim(p_body),
    'cliente_respondeu_pendencia', trim(p_body), v_task.subetapa, v_antes, false);
  return coalesce(v_antes, 'bloqueado');
end;
$$;

-- Pedir prioridade · registra o pedido; só o time muda a prioridade
create or replace function public.app_pedir_prioridade(
  p_task_id uuid, p_prioridade text, p_motivo text, p_ate date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_body text;
begin
  if p_prioridade not in ('alta', 'urgente') then
    raise exception 'Prioridade inválida';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Conte o que mudou';
  end if;
  v_task := app_portal_task_do_cliente(p_task_id);
  if v_task.status = 'concluido' then
    raise exception 'Tarefa já concluída';
  end if;
  if v_task.prioridade_pedido_em is not null then
    raise exception 'Já existe um pedido aguardando o time';
  end if;
  update public.tasks
    set prioridade_solicitada_cliente = p_prioridade,
        prioridade_pedido_em = now(),
        prioridade_pedido_ate = p_ate
    where id = p_task_id;
  v_body := 'Pediu prioridade ' || p_prioridade
    || coalesce(' até ' || to_char(p_ate, 'DD/MM/YYYY'), '')
    || ': ' || trim(p_motivo);
  perform app_portal_registrar(v_task, 'pedido_prioridade', v_body,
    'cliente_pediu_prioridade', v_body, null, null, true);
end;
$$;

-- Helpers internos: só as RPCs acima (security definer) chamam.
revoke all on function public.app_portal_task_do_cliente(uuid) from public, anon, authenticated;
revoke all on function public.app_portal_registrar(public.tasks, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.app_aprovar_entrega(uuid) to authenticated;
grant execute on function public.app_pedir_ajuste(uuid, text) to authenticated;
grant execute on function public.app_responder_pendencia(uuid, text) to authenticated;
grant execute on function public.app_pedir_prioridade(uuid, text, text, date) to authenticated;
