-- Aprovar entrega (portal cliente) passa a avançar a etapa (out/2026).
-- Antes: só gravava aprovado_em. Agora, se a task está em em_homologacao,
-- também move pra pronto_producao. Em etapas posteriores (revisão,
-- pronto, implantação) só registra a aprovação, sem voltar etapa.
-- Status macro é sincronizado pelo trigger sync_task_status_from_subetapa.

create or replace function public.app_aprovar_entrega(p_task_id uuid)
returns timestamp with time zone
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_cliente_id uuid;
  v_now timestamp with time zone;
  v_match int;
begin
  v_role := app_pessoa_role();
  if v_role is null or v_role != 'cliente' then
    raise exception 'Apenas cliente pode aprovar entrega';
  end if;
  v_cliente_id := app_pessoa_cliente_id();
  if v_cliente_id is null then
    raise exception 'Cliente sem cliente_id vinculado';
  end if;
  select count(*) into v_match from public.tasks
    where id = p_task_id
      and cliente_id = v_cliente_id
      and visivel_cliente = true
      and subetapa in ('em_homologacao','em_revisao','pronto_producao','em_implantacao');
  if v_match = 0 then
    raise exception 'Task inválida pra aprovação';
  end if;
  v_now := now();
  update public.tasks
    set aprovado_em = coalesce(aprovado_em, v_now),
        subetapa    = case when subetapa = 'em_homologacao' then 'pronto_producao' else subetapa end,
        subetapa_em = case when subetapa = 'em_homologacao' then v_now else subetapa_em end
    where id = p_task_id;
  return v_now;
end;
$$;

grant execute on function public.app_aprovar_entrega(uuid) to authenticated;
