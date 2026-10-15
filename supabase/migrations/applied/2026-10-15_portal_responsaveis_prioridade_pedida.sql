-- Portal (out/2026):
-- 1. app_portal_responsaveis(): cliente só lê o próprio registro em pessoas
--    (RLS), então o portal não conseguia mostrar o responsável das tasks.
--    A função devolve só id + nome de quem é responsável por tasks visíveis
--    do cliente do caller. Nada de e-mail, papel ou outros campos.
-- 2. tasks.prioridade_pedida: o pedido de prioridade fica num campo próprio;
--    prioridade_solicitada_cliente volta a ser só a escolha inicial.

-- 1 ─────────────────────────────────────────────────────────────────
create or replace function public.app_portal_responsaveis()
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nome
  from public.pessoas p
  where app_pessoa_role() = 'cliente'
    and p.id in (
      select t.pessoa_id from public.tasks t
      where t.cliente_id = app_pessoa_cliente_id()
        and t.visivel_cliente = true
        and t.pessoa_id is not null
    );
$$;
revoke all on function public.app_portal_responsaveis() from public, anon;
grant execute on function public.app_portal_responsaveis() to authenticated;

-- 2 ─────────────────────────────────────────────────────────────────
alter table public.tasks add column if not exists prioridade_pedida text;
alter table public.tasks drop constraint if exists tasks_prioridade_pedida_check;
alter table public.tasks add constraint tasks_prioridade_pedida_check
  check (prioridade_pedida is null or prioridade_pedida in ('urgente', 'alta'));

-- pedidos já abertos: migra o valor que foi gravado na coluna antiga
update public.tasks
  set prioridade_pedida = prioridade_solicitada_cliente
  where prioridade_pedido_em is not null
    and prioridade_solicitada_cliente in ('urgente', 'alta');

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
    set prioridade_pedida = p_prioridade,
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
grant execute on function public.app_pedir_prioridade(uuid, text, text, date) to authenticated;
