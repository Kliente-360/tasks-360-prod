-- Modal novo · "Lembrar o cliente" na homologação
--
-- Reenvia a notificação portal_homologar para as pessoas do cliente e
-- registra o lembrete no histórico da task. Não vira comentário: comentário
-- visível já notifica o cliente (sino duplicado) e dispara o webhook do
-- Salesforce. No máximo um lembrete por dia
-- por task (conta o último portal_homologar enviado, automático ou não).
-- Só a equipe interna chama.

create or replace function public.app_lembrar_homologacao(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tasks;
  ultimo timestamptz;
begin
  if not public.app_is_staff() then
    raise exception 'apenas a equipe interna pode lembrar o cliente';
  end if;

  select * into t from public.tasks where id = p_task_id;
  if not found then
    raise exception 'task não encontrada';
  end if;
  if t.subetapa <> 'em_homologacao' or t.aprovado_em is not null then
    return jsonb_build_object('ok', false, 'motivo', 'fora_de_homologacao');
  end if;
  if t.visivel_cliente is not true then
    return jsonb_build_object('ok', false, 'motivo', 'oculta_do_cliente');
  end if;

  select max(criado_em) into ultimo
  from public.notifications
  where source_task_id = p_task_id and kind = 'portal_homologar';
  if ultimo is not null and ultimo > now() - interval '20 hours' then
    return jsonb_build_object('ok', false, 'motivo', 'ja_lembrado_hoje', 'ultimo', ultimo);
  end if;

  perform public.notificar_clientes_da_task(t, 'portal_homologar', 'Kliente 360', '', null);

  insert into public.task_field_history
    (task_id, field, from_value, to_value, actor_pessoa_id, actor_source, occurred_at)
  values
    (p_task_id, 'lembrete_homologacao', null, 'enviado', public.app_pessoa_id(), 'app', now());

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.app_lembrar_homologacao(uuid) from public, anon;
grant execute on function public.app_lembrar_homologacao(uuid) to authenticated;
