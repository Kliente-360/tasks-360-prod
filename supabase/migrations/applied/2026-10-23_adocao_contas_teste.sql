-- Adoção · contas de teste fora dos números (out/2026)
-- pessoas.conta_teste marca logins usados só para testar (ex.: "Usuário
-- Teste"). A view usage_events_reais exclui esses eventos e as RPCs
-- app_adocao / app_adocao_detalhes passam a ler dela (reaplicadas a seguir).

alter table public.pessoas add column if not exists conta_teste boolean not null default false;
update public.pessoas set conta_teste = true where lower(email) = 'teresa@kliente360.com';

create or replace view public.usage_events_reais as
  select e.* from public.usage_events e
  where not exists (select 1 from public.pessoas p where p.id = e.pessoa_id and p.conta_teste);
-- Só as RPCs (security definer, admin) leem a view
revoke all on public.usage_events_reais from anon, authenticated;
