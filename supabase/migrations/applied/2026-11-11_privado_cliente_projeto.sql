-- Privado em cascata (CEO): cliente privado → projetos e tasks dele;
-- projeto privado → tasks dele; task privada continua valendo sozinha.
-- Quem vê: o CEO e o responsável da task. Os demais não veem nada nas
-- listas; nas análises de horas e ocupação recebem um bloco anônimo via
-- app_privado_anonimo() (sem título, cliente, projeto nem nota).
-- Não faz UPDATE em tasks (não dispara webhook).

alter table public.clientes add column if not exists privado boolean not null default false;
alter table public.projetos add column if not exists privado boolean not null default false;

create or replace function public.app_is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_ceo from pessoas where user_id = auth.uid() limit 1), false);
$$;

-- Cliente ou projeto privado (ignora RLS para não haver recursão)
create or replace function public.app_cp_privado(p_cliente uuid, p_projeto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select privado from clientes where id = p_cliente), false)
      or coalesce((select privado from projetos where id = p_projeto), false);
$$;

create or replace function public.app_task_privada_efetiva(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select t.privada or public.app_cp_privado(t.cliente_id, t.projeto_id)
    from tasks t where t.id = p_task
  ), false);
$$;

-- A pessoa logada é responsável por alguma task do cliente / projeto
create or replace function public.app_tenho_task_no_cliente(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasks where cliente_id = p_cliente and pessoa_id = public.app_pessoa_id());
$$;
create or replace function public.app_tenho_task_no_projeto(p_projeto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasks where projeto_id = p_projeto and pessoa_id = public.app_pessoa_id());
$$;

-- Tasks: privada efetiva só para o CEO e o responsável
drop policy if exists task_privada_somente_dono on public.tasks;
create policy task_privada_somente_dono on public.tasks as restrictive for all
  using (
    (privada = false and not public.app_cp_privado(cliente_id, projeto_id))
    or pessoa_id = public.app_pessoa_id()
    or public.app_is_ceo()
  );

-- Clientes privados
drop policy if exists clientes_privado on public.clientes;
create policy clientes_privado on public.clientes as restrictive for all
  using (
    privado = false
    or public.app_is_ceo()
    or id = public.app_pessoa_cliente_id()
    or public.app_tenho_task_no_cliente(id)
  );

-- Projetos privados (ou de cliente privado)
drop policy if exists projetos_privado on public.projetos;
create policy projetos_privado on public.projetos as restrictive for all
  using (
    not public.app_cp_privado(cliente_id, id)
    or public.app_is_ceo()
    or public.app_tenho_task_no_projeto(id)
  );

-- Horas de task privada: só o CEO e quem lançou
drop policy if exists time_entries_privado on public.time_entries;
create policy time_entries_privado on public.time_entries as restrictive for all
  using (
    pessoa_id = public.app_pessoa_id()
    or public.app_is_ceo()
    or not public.app_task_privada_efetiva(task_id)
  );

-- Só o CEO liga ou desliga o privado (service role passa)
create or replace function public.trg_privado_so_ceo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.privado and not public.app_is_ceo() then
      raise exception 'Só o CEO pode marcar como privado';
    end if;
  elsif new.privado is distinct from old.privado and not public.app_is_ceo() then
    raise exception 'Só o CEO pode marcar como privado';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_clientes_privado_so_ceo on public.clientes;
create trigger trg_clientes_privado_so_ceo before insert or update on public.clientes
  for each row execute function public.trg_privado_so_ceo();
drop trigger if exists trg_projetos_privado_so_ceo on public.projetos;
create trigger trg_projetos_privado_so_ceo before insert or update on public.projetos
  for each row execute function public.trg_privado_so_ceo();

-- Bloco anônimo para as análises de quem não vê o privado
create or replace function public.app_privado_anonimo(p_cutoff timestamptz, p_horas_desde timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_eu uuid := public.app_pessoa_id();
  v_tasks jsonb;
  v_horas jsonb;
begin
  if v_eu is null or public.app_is_ceo() or not public.app_is_staff() then
    return jsonb_build_object('tasks', '[]'::jsonb, 'horas', '[]'::jsonb);
  end if;

  with ocultas as (
    select t.* from tasks t
    where (t.privada or public.app_cp_privado(t.cliente_id, t.projeto_id))
      and t.pessoa_id is distinct from v_eu
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'pessoa_id', o.pessoa_id, 'prioridade', o.prioridade,
      'esforco', o.esforco, 'esforco_inicial', o.esforco_inicial, 'complexidade', o.complexidade,
      'prazo', o.prazo, 'status', o.status, 'subetapa', o.subetapa,
      'criado_em', o.criado_em, 'status_em', o.status_em, 'subetapa_em', o.subetapa_em,
      'andamento_em', o.andamento_em, 'homologacao_em', o.homologacao_em, 'aprovado_em', o.aprovado_em,
      'arquivado_em', o.arquivado_em, 'area_tecnica', o.area_tecnica, 'tipo_trabalho', o.tipo_trabalho,
      'tempo_real_horas', o.tempo_real_horas, 'reopen_count', o.reopen_count
    )), '[]'::jsonb)
  into v_tasks
  from ocultas o
  where o.status <> 'concluido' or o.status_em >= p_cutoff;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'task_id', e.task_id, 'pessoa_id', e.pessoa_id,
      'started_at', e.started_at, 'ended_at', e.ended_at, 'criado_em', e.criado_em
    )), '[]'::jsonb)
  into v_horas
  from time_entries e
  join tasks t on t.id = e.task_id
  where (t.privada or public.app_cp_privado(t.cliente_id, t.projeto_id))
    and e.pessoa_id is distinct from v_eu
    and e.started_at >= p_horas_desde
    and (public.app_is_admin());

  return jsonb_build_object('tasks', v_tasks, 'horas', v_horas);
end;
$$;
grant execute on function public.app_privado_anonimo(timestamptz, timestamptz) to authenticated;
