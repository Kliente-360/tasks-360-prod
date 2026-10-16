-- Acesso do usuário cliente no portal (out/2026)
--   completo · lê, comenta, pede prioridade, homologa e abre solicitações
--   leitura  · tudo acima, exceto abrir solicitações
-- Cliente não altera o próprio cadastro (pessoas só tem SELECT do próprio
-- registro para cliente), então não há auto-promoção.

alter table public.pessoas
  add column if not exists acesso_portal text not null default 'completo';

alter table public.pessoas drop constraint if exists pessoas_acesso_portal_check;
alter table public.pessoas add constraint pessoas_acesso_portal_check
  check (acesso_portal in ('completo', 'leitura'));

create or replace function public.app_cliente_pode_abrir_solicitacao()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select acesso_portal = 'completo' from public.pessoas where user_id = auth.uid() limit 1), false);
$$;
grant execute on function public.app_cliente_pode_abrir_solicitacao() to authenticated;

drop policy if exists tasks_cliente_insert on public.tasks;
create policy tasks_cliente_insert on public.tasks
  for insert
  with check (
    app_pessoa_role() = 'cliente'
    and app_cliente_pode_abrir_solicitacao()
    and cliente_id = app_pessoa_cliente_id()
    and visivel_cliente = true
    and subetapa = 'backlog'
    and status = 'backlog'
    and criado_por_cliente = true
    and triada_em is null
    and pessoa_id is null
    and privada = false
  );
