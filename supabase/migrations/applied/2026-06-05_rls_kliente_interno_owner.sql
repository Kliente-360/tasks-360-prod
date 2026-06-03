-- ============================================================
-- RLS · Kliente 360 visível pra interno SÓ se for owner da task
-- ============================================================
-- Contexto:
--   Hoje admin vê tudo. Interno (staff) também via app_is_staff(),
--   mas tem uma regra adicional que restringe Kliente 360 (cliente
--   eh_interno=true) ao admin. Quando uma task de gestão é
--   ATRIBUÍDA a um interno (pessoa_id), ele precisa enxergar.
--
-- Regra nova (combinada):
--   - admin: tudo (inclusive todas as tasks Kliente 360)
--   - interno: vê task se
--       (a) cliente NÃO é interno, OU
--       (b) pessoa_id = própria (é o owner)
--   - cliente externo: inalterado (já restringido pela policy
--     tasks_cliente_select)
--
-- Operação:
--   - Roda no SQL Editor do Dashboard (sem CLI).
--   - Após rodar, mover este arquivo pra applied/.

-- 1) Helper: viewer é admin?
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

-- 2) Drop policies antigas de staff/admin/interno em tasks pra
--    reaplicar de forma consistente. Mantém cliente_select e
--    a restrictive de privada intactas.
drop policy if exists tasks_staff_all on tasks;
drop policy if exists tasks_admin_all on tasks;
drop policy if exists tasks_interno_all on tasks;
drop policy if exists tasks_interno_select on tasks;
drop policy if exists tasks_interno_mod on tasks;
drop policy if exists tasks_kliente_admin_only on tasks;
drop policy if exists tasks_admin_kliente on tasks;

-- 3) Admin: full access (incluindo Kliente 360 inteiro)
create policy tasks_admin_all on tasks
  for all
  using (app_is_admin())
  with check (app_is_admin());

-- 4) Interno: SELECT/INSERT/UPDATE/DELETE em tasks de clientes
--    externos OU em tasks Kliente 360 onde é o owner.
--    "cliente interno" = clientes.eh_interno = true.
--
--    Implementado como duas policies (uma pra read, outra pra write)
--    porque o predicado depende de join em clientes — Postgres avalia
--    sub-selects ok mas é mais legível separado.

-- 4a) SELECT
create policy tasks_interno_select on tasks
  for select
  using (
    app_pessoa_role() = 'interno'
    and (
      not exists (
        select 1 from clientes c
        where c.id = tasks.cliente_id and c.eh_interno = true
      )
      or pessoa_id = app_pessoa_id()
    )
  );

-- 4b) INSERT/UPDATE/DELETE · interno pode mexer nas mesmas tasks
--     que enxerga. Mesmo predicado.
create policy tasks_interno_modify on tasks
  for all
  using (
    app_pessoa_role() = 'interno'
    and (
      not exists (
        select 1 from clientes c
        where c.id = tasks.cliente_id and c.eh_interno = true
      )
      or pessoa_id = app_pessoa_id()
    )
  )
  with check (
    app_pessoa_role() = 'interno'
    and (
      not exists (
        select 1 from clientes c
        where c.id = tasks.cliente_id and c.eh_interno = true
      )
      or pessoa_id = app_pessoa_id()
    )
  );

-- 5) Verificação manual sugerida (rodar no SQL Editor depois):
--    -- como admin: deve retornar todas as tasks Kliente 360
--    select count(*) from tasks t join clientes c on c.id = t.cliente_id
--      where c.eh_interno = true;
--    -- como interno (via supabase auth.uid), deve retornar só as que
--    --   pessoa_id = app_pessoa_id() OU cliente.eh_interno = false.
