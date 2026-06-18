-- ============================================================
-- Bucket D · Onda 3.C · aprovação portal + métrica tempo
-- ============================================================
-- Adiciona timestamps de aprovação + automação por trigger + RPC
-- security definer pra cliente externo aprovar a entrega.
--
-- 3.7 · botão "Aprovar entrega" no Portal cliente
-- 3.8 · métrica derivada: aprovado_em - homologacao_em
-- ============================================================

begin;

alter table public.tasks
  add column if not exists homologacao_em timestamp with time zone,
  add column if not exists aprovado_em timestamp with time zone;

-- ─── Trigger: set homologacao_em na PRIMEIRA entrada em em_homologacao
create or replace function fn_set_homologacao_em()
returns trigger
language plpgsql
as $$
begin
  if new.subetapa = 'em_homologacao'
    and (old.subetapa is null or old.subetapa is distinct from 'em_homologacao')
    and new.homologacao_em is null then
    new.homologacao_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_homologacao_em on public.tasks;
create trigger trg_set_homologacao_em
  before update of subetapa on public.tasks
  for each row execute function fn_set_homologacao_em();

-- ─── Trigger: set aprovado_em ao concluir (fallback se cliente não aprovou)
create or replace function fn_set_aprovado_em_on_concluir()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'concluido'
    and (old.status is null or old.status is distinct from 'concluido')
    and new.aprovado_em is null then
    new.aprovado_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_aprovado_em_on_concluir on public.tasks;
create trigger trg_set_aprovado_em_on_concluir
  before update of status on public.tasks
  for each row execute function fn_set_aprovado_em_on_concluir();

-- ─── RPC: cliente externo aprova entrega (security definer)
-- RLS de cliente em tasks só permite SELECT. Sem RPC com elevated
-- privileges, cliente não conseguiria UPDATE aprovado_em.
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
  -- valida que a task pertence ao cliente, é visível, e está em em_homologacao+
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
    set aprovado_em = v_now
    where id = p_task_id and aprovado_em is null;
  return v_now;
end;
$$;

grant execute on function public.app_aprovar_entrega(uuid) to authenticated;

commit;
