-- ============================================================
-- RLS Kliente 360 · interno como owner — versão 2 (correção)
-- ============================================================
-- A v1 (2026-06-05_rls_kliente_interno_owner.sql) usou um único
-- predicado com (NOT EXISTS ... OR pessoa_id = me). Aparentemente
-- não fechou pra todos os casos.
--
-- Estratégia v2: SPLIT em policies permissivas SEPARADAS. Postgres
-- combina policies permissivas com OR, então:
--   - policy A · interno vê/edita tasks de clientes NÃO eh_interno
--   - policy B · interno vê/edita tasks ONDE é o owner (qualquer cliente)
--
-- Resultado: interno enxerga tudo de clientes externos + suas
-- próprias tasks (inclusive em Kliente 360). Admin segue com policy
-- separada (full access). RLS de cliente externo inalterado.

-- 0) helper app_is_admin (idempotente · se já existir, reaproveita)
create or replace function app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app_pessoa_role() = 'admin', false);
$$;
grant execute on function app_is_admin() to anon, authenticated;

-- 1) Drop todas as variantes anteriores (idempotente)
drop policy if exists tasks_staff_all on tasks;
drop policy if exists tasks_admin_all on tasks;
drop policy if exists tasks_interno_all on tasks;
drop policy if exists tasks_interno_select on tasks;
drop policy if exists tasks_interno_modify on tasks;
drop policy if exists tasks_interno_non_kliente on tasks;
drop policy if exists tasks_interno_owner on tasks;
drop policy if exists tasks_kliente_admin_only on tasks;
drop policy if exists tasks_admin_kliente on tasks;

-- 2) Admin: full access (todas as tasks, todos os clientes)
create policy tasks_admin_all on tasks
  for all
  using (app_is_admin())
  with check (app_is_admin());

-- 3) Interno · branch A · vê/edita tasks de clientes NÃO internos.
--    Subquery em clientes herda RLS, mas clientes_staff_all libera
--    staff inteiro → interno enxerga todos os clientes.
create policy tasks_interno_non_kliente on tasks
  for all
  using (
    app_pessoa_role() = 'interno'
    and exists (
      select 1 from clientes c
      where c.id = tasks.cliente_id
        and c.eh_interno = false
    )
  )
  with check (
    app_pessoa_role() = 'interno'
    and exists (
      select 1 from clientes c
      where c.id = tasks.cliente_id
        and c.eh_interno = false
    )
  );

-- 4) Interno · branch B · vê/edita tasks ONDE é o owner — qualquer
--    cliente (cobre o caso Kliente 360 atribuída a um interno).
create policy tasks_interno_owner on tasks
  for all
  using (
    app_pessoa_role() = 'interno'
    and pessoa_id = app_pessoa_id()
  )
  with check (
    app_pessoa_role() = 'interno'
    and pessoa_id = app_pessoa_id()
  );

-- ============================================================
-- 5) Diagnóstico · rodar após criar pra validar
-- ============================================================
-- a) Lista as policies atuais em tasks:
--    select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr
--    from pg_policy where polrelid = 'tasks'::regclass order by polname;
--
-- b) Verifica como o usuário interno vê uma task Kliente 360
--    onde ele é o owner. Substituir <user_email>:
--    set role authenticated;
--    set request.jwt.claims to (
--      select jsonb_build_object('sub', user_id::text, 'role', 'authenticated')
--      from pessoas p
--      where p.email = '<user_email>'
--    )::text;
--    select count(*) from tasks t
--    join clientes c on c.id = t.cliente_id
--    where c.eh_interno = true and t.pessoa_id = (
--      select id from pessoas where email = '<user_email>'
--    );
--    reset role;
--    -- esperado: count > 0 (ele vê suas próprias tasks Kliente 360)
--
-- c) Se quiser ter certeza que o cliente "Kliente 360" está marcado:
--    select id, nome, eh_interno from clientes where eh_interno = true;
