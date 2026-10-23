-- Adoção · detalhes por propriedade dos eventos (out/2026)
-- origem (modal × cronômetro do topo × kanban...), comentários externos,
-- campos alterados, abas do modal.

create or replace function public.app_adocao_detalhes(p_dias int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_desde timestamptz;
begin
  if not app_is_admin() then
    raise exception 'Apenas admin';
  end if;
  v_desde := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 90)));
  return jsonb_build_object(
    'por_origem', coalesce((select jsonb_agg(x order by x.evento, x.total desc) from (
        select evento, coalesce(props->>'origem', case when props ? 'portal' then 'portal' else '—' end) as origem,
               count(*) as total, count(distinct pessoa_id) as usuarios
        from usage_events_reais
        where criado_em >= v_desde
          and evento in ('timer_start','timer_stop','timesheet_lancamento','task_update','task_create','task_open','comment_post')
        group by 1, 2) x), '[]'::jsonb),
    'comentarios', (select jsonb_build_object(
        'total', count(*),
        'externos', count(*) filter (where (props->>'visivel_cliente')::boolean is true),
        'internos', count(*) filter (where (props->>'visivel_cliente')::boolean is false),
        'respostas', count(*) filter (where (props->>'resposta')::boolean is true),
        'do_cliente', count(*) filter (where role = 'cliente'),
        'tornados_externos', (select count(*) from usage_events_reais where criado_em >= v_desde and evento = 'comment_visibilidade' and (props->>'visivel_cliente')::boolean is true)
      ) from usage_events_reais where criado_em >= v_desde and evento = 'comment_post'),
    'campos', coalesce((select jsonb_agg(x order by x.total desc) from (
        select c.campo, props->>'origem' as origem, count(*) as total, count(distinct pessoa_id) as usuarios
        from usage_events_reais e, jsonb_array_elements_text(coalesce(e.props->'campos', '[]'::jsonb)) as c(campo)
        where e.criado_em >= v_desde and e.evento in ('task_update', 'bulk_update')
        group by 1, 2) x), '[]'::jsonb),
    'abas_modal', coalesce((select jsonb_agg(x order by x.total desc) from (
        select props->>'tipo' as tipo, props->>'aba' as aba, count(*) as total, count(distinct pessoa_id) as usuarios
        from usage_events_reais where criado_em >= v_desde and evento = 'modal_aba'
        group by 1, 2) x), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.app_adocao_detalhes(int) from public, anon;
grant execute on function public.app_adocao_detalhes(int) to authenticated;
