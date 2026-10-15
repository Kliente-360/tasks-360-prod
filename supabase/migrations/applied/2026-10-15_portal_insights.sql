-- Caixas de IA do portal (out/2026)
-- Textos gerados por rotina agendada (claude.ai/code trigger) e gravados
-- via edge function post-portal-insight (service role). Publicação direta,
-- sem aprovação. O portal mostra o mais recente de cada tipo.
--
-- tipo 'entregas' · periodo = 'YYYY-MM' (mês avaliado, o anterior ao run)
-- tipo 'riscos'   · periodo = 'YYYY-MM-DD' (segunda-feira da semana do run)

create table if not exists public.portal_insights (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null check (tipo in ('entregas', 'riscos')),
  periodo text not null,
  conteudo_md text not null,
  gerado_em timestamptz not null default now(),
  unique (cliente_id, tipo, periodo)
);

create index if not exists portal_insights_cliente_tipo_idx
  on public.portal_insights (cliente_id, tipo, periodo desc);

alter table public.portal_insights enable row level security;

-- Staff lê tudo (inclusive pra simular o portal); cliente só os próprios.
-- Escrita só pela edge function (service role, ignora RLS).
drop policy if exists portal_insights_staff_select on public.portal_insights;
create policy portal_insights_staff_select on public.portal_insights
  for select using (app_is_staff());

drop policy if exists portal_insights_cliente_select on public.portal_insights;
create policy portal_insights_cliente_select on public.portal_insights
  for select using (
    app_pessoa_role() = 'cliente' and cliente_id = app_pessoa_cliente_id()
  );
