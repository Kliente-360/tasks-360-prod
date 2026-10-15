-- Login do cliente (out/2026)
-- A tela de login conferia o cadastro lendo `pessoas` direto do navegador,
-- antes do login (role anon). Depois do reforço de RLS (V.3), anon não lê
-- `pessoas`, então a consulta sempre voltava vazia e todo e-mail aparecia
-- como "não cadastrado". Esta função responde só o status do e-mail, sem
-- expor dados da pessoa.

create or replace function public.app_login_status(p_email text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case when p.invited_at is null then 'sem_convite' else 'ok' end
       from public.pessoas p
      where lower(p.email) = lower(trim(p_email))
      order by p.invited_at desc nulls last
      limit 1),
    'nao_cadastrado'
  );
$$;

revoke all on function public.app_login_status(text) from public;
grant execute on function public.app_login_status(text) to anon, authenticated;
