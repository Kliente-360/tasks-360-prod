-- Telemetria de uso (out/2026) · interno e cliente externo
--
-- usage_events: um registro por evento (clique, troca de tela, abertura de
-- task, comentário, filtro, export...). O app grava em lote. Quem/papel/
-- cliente são carimbados pelo banco (trigger), não pelo navegador.
-- Retenção: 90 dias. Antes de apagar, o resumo diário vai para
-- usage_daily, que fica sem prazo.
-- Leitura: só admin. Escrita: qualquer usuário logado, só eventos próprios.

create table if not exists public.usage_events (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  pessoa_id uuid,
  role text,
  cliente_id uuid,
  session_id text,
  evento text not null check (char_length(evento) between 1 and 60),
  rota text check (rota is null or char_length(rota) <= 120),
  alvo text check (alvo is null or char_length(alvo) <= 120),
  task_id uuid,
  dispositivo text check (dispositivo is null or dispositivo in ('desktop', 'mobile')),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 2000)
);

create index if not exists usage_events_criado_idx on public.usage_events (criado_em);
create index if not exists usage_events_evento_idx on public.usage_events (evento, criado_em);
create index if not exists usage_events_pessoa_idx on public.usage_events (pessoa_id, criado_em);

-- Carimba autoria pelo usuário logado (ignora o que vier do cliente)
create or replace function public.trg_usage_events_autoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.pessoa_id := app_pessoa_id();
  new.role := (select role from pessoas where user_id = auth.uid() limit 1);
  new.cliente_id := (select cliente_id from pessoas where user_id = auth.uid() limit 1);
  new.criado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_usage_events_autoria on public.usage_events;
create trigger trg_usage_events_autoria
  before insert on public.usage_events
  for each row execute function public.trg_usage_events_autoria();

alter table public.usage_events enable row level security;

drop policy if exists usage_events_insert_self on public.usage_events;
create policy usage_events_insert_self on public.usage_events
  for insert to authenticated
  with check (app_pessoa_id() is not null);

drop policy if exists usage_events_admin_select on public.usage_events;
create policy usage_events_admin_select on public.usage_events
  for select using (app_is_admin());

-- Resumo diário (longo prazo)
create table if not exists public.usage_daily (
  dia date not null,
  evento text not null,
  alvo text not null default '',
  rota text not null default '',
  role text not null default '',
  pessoa_id uuid,
  cliente_id uuid,
  dispositivo text not null default '',
  total integer not null,
  primary key (dia, evento, alvo, rota, role, dispositivo, pessoa_id)
);
alter table public.usage_daily alter column pessoa_id set default '00000000-0000-0000-0000-000000000000';
alter table public.usage_daily enable row level security;
drop policy if exists usage_daily_admin_select on public.usage_daily;
create policy usage_daily_admin_select on public.usage_daily
  for select using (app_is_admin());

-- Consolida dias fechados ainda não consolidados e apaga eventos > 90 dias
create or replace function public.usage_consolidar()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ate date := (now() at time zone 'America/Sao_Paulo')::date;  -- até ontem (exclusivo hoje)
  v_desde date := coalesce((select max(dia) + 1 from usage_daily), '2000-01-01'::date);
begin
  insert into usage_daily (dia, evento, alvo, rota, role, pessoa_id, cliente_id, dispositivo, total)
  select (criado_em at time zone 'America/Sao_Paulo')::date, evento, coalesce(alvo, ''), coalesce(rota, ''),
         coalesce(role, ''), coalesce(pessoa_id, '00000000-0000-0000-0000-000000000000'),
         max(cliente_id::text)::uuid, coalesce(dispositivo, ''), count(*)
  from usage_events
  where (criado_em at time zone 'America/Sao_Paulo')::date >= v_desde
    and (criado_em at time zone 'America/Sao_Paulo')::date < v_ate
  group by 1, 2, 3, 4, 5, 6, 8
  on conflict do nothing;

  delete from usage_events where criado_em < now() - interval '90 days';
end;
$$;
revoke all on function public.usage_consolidar() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'usage-consolidar-diario';
select cron.schedule('usage-consolidar-diario', '30 3 * * *', $$select public.usage_consolidar();$$);
