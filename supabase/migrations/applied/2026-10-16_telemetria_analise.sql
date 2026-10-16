-- Análise de adoção (out/2026) · agrega usage_events no servidor.
-- Só admin. Período em dias (1–90, a retenção dos eventos detalhados).

create or replace function public.app_adocao(p_dias int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_desde timestamptz;
  v jsonb;
begin
  if not app_is_admin() then
    raise exception 'Apenas admin';
  end if;
  v_desde := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 90)));

  with ev as (
    select e.*, coalesce(p.nome, '—') as pessoa_nome, c.nome as cliente_nome
    from usage_events e
    left join pessoas p on p.id = e.pessoa_id
    left join clientes c on c.id = e.cliente_id
    where e.criado_em >= v_desde
  )
  select jsonb_build_object(
    'desde', v_desde,
    'resumo', (select jsonb_build_object(
        'eventos', count(*),
        'usuarios', count(distinct pessoa_id),
        'sessoes', count(distinct session_id),
        'usuarios_internos', count(distinct pessoa_id) filter (where role in ('admin','interno')),
        'usuarios_clientes', count(distinct pessoa_id) filter (where role = 'cliente'),
        'eventos_mobile', count(*) filter (where dispositivo = 'mobile')
      ) from ev),
    'por_evento', coalesce((select jsonb_agg(x order by x.total desc) from (
        select evento, count(*) as total, count(distinct pessoa_id) as usuarios,
               count(*) filter (where role = 'cliente') as total_cliente,
               count(*) filter (where dispositivo = 'mobile') as total_mobile,
               max(criado_em) as ultimo
        from ev group by evento) x), '[]'::jsonb),
    'por_tela', coalesce((select jsonb_agg(x order by x.views desc) from (
        select rota, count(*) as views, count(distinct pessoa_id) as usuarios,
               count(*) filter (where role = 'cliente') as views_cliente,
               count(*) filter (where dispositivo = 'mobile') as views_mobile
        from ev where evento = 'page_view' group by rota) x), '[]'::jsonb),
    'por_clique', coalesce((select jsonb_agg(x order by x.total desc) from (
        select rota, alvo, count(*) as total, count(distinct pessoa_id) as usuarios
        from ev where evento = 'click' group by rota, alvo order by count(*) desc limit 150) x), '[]'::jsonb),
    'por_pessoa', coalesce((select jsonb_agg(x order by x.eventos desc) from (
        select pessoa_id, pessoa_nome, role, cliente_nome,
               count(*) as eventos, count(distinct session_id) as sessoes,
               count(distinct (criado_em at time zone 'America/Sao_Paulo')::date) as dias_ativos,
               count(*) filter (where dispositivo = 'mobile') as eventos_mobile,
               max(criado_em) as ultimo
        from ev group by pessoa_id, pessoa_nome, role, cliente_nome) x), '[]'::jsonb),
    'por_dia', coalesce((select jsonb_agg(x order by x.dia) from (
        select (criado_em at time zone 'America/Sao_Paulo')::date as dia,
               count(*) as eventos, count(distinct pessoa_id) as usuarios
        from ev group by 1) x), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

revoke all on function public.app_adocao(int) from public, anon;
grant execute on function public.app_adocao(int) to authenticated;
