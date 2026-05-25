-- ============================================================
-- 2026-05-12_rls_role_aware.sql
-- Isolamento de tenant pra role=cliente. Substitui as policies
-- `prototipo_all` (USING true) por policies role-aware.
--
-- Problema atual: PostgreSQL combina policies permissivas via OR.
-- A policy `prototipo_all USING (true)` que sobrou do MVP convive
-- com policies restritivas tenant-aware — então toda linha passa,
-- e a restritiva fica decorativa.
--
-- Esta migration:
--   1. Cria helpers stable pra role/cliente_id do usuário logado
--   2. Dropa `prototipo_all` em todas as tabelas com dados sensíveis
--   3. Recria policies por role:
--      - admin/interno: full access (igual hoje)
--      - cliente: SELECT scoped por cliente_id e visivel_cliente=true,
--                 sem INSERT/UPDATE/DELETE (exceto task_comments que
--                 permite cliente comentar em task dele e visível)
--      - anon (sem auth): NEGADO (não há cenário de produção)
--   4. Habilita RLS em task_dependencies (estava off) com policy
--   5. Storage bucket task-attachments também ganha tenant check
--
-- Idempotente. Roda no SQL Editor do Supabase.
--
-- IMPORTANTE: Antes de rodar, garanta que TODOS os usuários internos
-- têm `pessoas.user_id` populado e `role` correto. Caso contrário,
-- usuário sem role definida cai em policy de cliente (mais restrita)
-- e pode perder acesso. Confira:
--   select role, count(*) from pessoas group by role;
-- ============================================================

-- ============================================================
-- 1. HELPER FUNCTIONS
-- ============================================================

-- Role da pessoa logada. Retorna null se não autenticado ou sem pessoa.
create or replace function app_pessoa_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from pessoas where user_id = auth.uid() limit 1;
$$;

-- cliente_id da pessoa logada. Usado pra scoping tenant.
create or replace function app_pessoa_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cliente_id from pessoas where user_id = auth.uid() limit 1;
$$;

-- id da própria pessoa logada (pra policies que dependem do usuário).
create or replace function app_pessoa_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from pessoas where user_id = auth.uid() limit 1;
$$;

-- Predicado: o viewer atual é admin/interno (acesso total).
create or replace function app_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app_pessoa_role() in ('admin','interno'), false);
$$;

grant execute on function app_pessoa_role()      to anon, authenticated;
grant execute on function app_pessoa_cliente_id() to anon, authenticated;
grant execute on function app_pessoa_id()        to anon, authenticated;
grant execute on function app_is_staff()         to anon, authenticated;

-- ============================================================
-- 2. CLIENTES
-- ============================================================
-- Staff vê tudo. Cliente vê só o próprio cliente_id.
-- Ninguém de fora do staff escreve.
drop policy if exists prototipo_all on clientes;
drop policy if exists clientes_staff_all on clientes;
drop policy if exists clientes_cliente_self on clientes;

create policy clientes_staff_all on clientes
  for all
  using (app_is_staff())
  with check (app_is_staff());

create policy clientes_cliente_self on clientes
  for select
  using (
    app_pessoa_role() = 'cliente'
    and id = app_pessoa_cliente_id()
  );

-- ============================================================
-- 3. PROJETOS
-- ============================================================
drop policy if exists prototipo_all on projetos;
drop policy if exists projetos_staff_all on projetos;
drop policy if exists projetos_cliente_select on projetos;

create policy projetos_staff_all on projetos
  for all
  using (app_is_staff())
  with check (app_is_staff());

create policy projetos_cliente_select on projetos
  for select
  using (
    app_pessoa_role() = 'cliente'
    and cliente_id = app_pessoa_cliente_id()
  );

-- ============================================================
-- 4. PESSOAS
-- ============================================================
-- Staff vê tudo. Cliente só vê a si mesmo (pra `currentPessoa`
-- e auth lookup funcionar). Nomes dos responsáveis aparecem
-- via join na task; não precisamos expor a tabela `pessoas`
-- inteira pra cliente.
drop policy if exists prototipo_all on pessoas;
drop policy if exists pessoas_staff_all on pessoas;
drop policy if exists pessoas_cliente_self on pessoas;
drop policy if exists pessoas_cliente_team on pessoas;

create policy pessoas_staff_all on pessoas
  for all
  using (app_is_staff())
  with check (app_is_staff());

-- Cliente vê só a própria linha. NÃO expõe outras pessoas
-- (skills/senioridade/capacidade/cliente_principal) pra cliente.
create policy pessoas_cliente_self on pessoas
  for select
  using (
    app_pessoa_role() = 'cliente'
    and user_id = auth.uid()
  );

-- ============================================================
-- 5. TASKS
-- ============================================================
-- Staff: full. Cliente: SELECT só tasks do próprio cliente_id E
-- visivel_cliente=true. Cliente NÃO escreve (sem policy with check).
drop policy if exists prototipo_all on tasks;
drop policy if exists tasks_staff_all on tasks;
drop policy if exists tasks_cliente_select on tasks;
drop policy if exists cliente_only_own_tasks on tasks;

create policy tasks_staff_all on tasks
  for all
  using (app_is_staff())
  with check (app_is_staff());

create policy tasks_cliente_select on tasks
  for select
  using (
    app_pessoa_role() = 'cliente'
    and cliente_id = app_pessoa_cliente_id()
    and visivel_cliente = true
  );

-- ============================================================
-- 6. TASK_COMMENTS
-- ============================================================
-- Staff: full. Cliente: SELECT comments visíveis em tasks dele +
-- INSERT comments próprios (marcados from_cliente=true por trigger).
drop policy if exists prototipo_all on task_comments;
drop policy if exists task_comments_staff_all on task_comments;
drop policy if exists task_comments_cliente_select on task_comments;
drop policy if exists task_comments_cliente_insert on task_comments;
drop policy if exists cliente_only_visivel_comments on task_comments;

create policy task_comments_staff_all on task_comments
  for all
  using (app_is_staff())
  with check (app_is_staff());

create policy task_comments_cliente_select on task_comments
  for select
  using (
    app_pessoa_role() = 'cliente'
    and visivel_cliente = true
    and exists (
      select 1 from tasks tk
      where tk.id = task_comments.task_id
        and tk.cliente_id = app_pessoa_cliente_id()
        and tk.visivel_cliente = true
    )
  );

create policy task_comments_cliente_insert on task_comments
  for insert
  with check (
    app_pessoa_role() = 'cliente'
    and visivel_cliente = true
    and exists (
      select 1 from tasks tk
      where tk.id = task_comments.task_id
        and tk.cliente_id = app_pessoa_cliente_id()
        and tk.visivel_cliente = true
    )
  );

-- ============================================================
-- 7. TASK_STATUS_HISTORY
-- ============================================================
drop policy if exists prototipo_all on task_status_history;
drop policy if exists task_status_history_staff_all on task_status_history;
drop policy if exists task_status_history_cliente_select on task_status_history;

create policy task_status_history_staff_all on task_status_history
  for all
  using (app_is_staff())
  with check (app_is_staff());

create policy task_status_history_cliente_select on task_status_history
  for select
  using (
    app_pessoa_role() = 'cliente'
    and exists (
      select 1 from tasks tk
      where tk.id = task_status_history.task_id
        and tk.cliente_id = app_pessoa_cliente_id()
        and tk.visivel_cliente = true
    )
  );

-- ============================================================
-- 8. TASK_FIELD_HISTORY
-- ============================================================
drop policy if exists task_field_history_select on task_field_history;
drop policy if exists task_field_history_insert on task_field_history;
drop policy if exists task_field_history_staff_all on task_field_history;
drop policy if exists task_field_history_cliente_select on task_field_history;

create policy task_field_history_staff_all on task_field_history
  for all
  using (app_is_staff())
  with check (app_is_staff());

create policy task_field_history_cliente_select on task_field_history
  for select
  using (
    app_pessoa_role() = 'cliente'
    and exists (
      select 1 from tasks tk
      where tk.id = task_field_history.task_id
        and tk.cliente_id = app_pessoa_cliente_id()
        and tk.visivel_cliente = true
    )
  );

-- ============================================================
-- 9. TASK_ATTACHMENTS (caso a migration original não tenha rodado)
-- ============================================================
-- Cria tabela se não existir, habilita RLS, troca prototipo_all
-- por policies tenant-aware. Cliente lê anexos de tasks visíveis
-- mas não faz upload/delete pelo portal.
do $$ begin
  if exists (select 1 from pg_class where relname = 'task_attachments') then
    -- assegura RLS habilitado
    execute 'alter table task_attachments enable row level security';
  end if;
end $$;

drop policy if exists prototipo_all on task_attachments;
drop policy if exists task_attachments_staff_all on task_attachments;
drop policy if exists task_attachments_cliente_select on task_attachments;

do $$ begin
  if exists (select 1 from pg_class where relname = 'task_attachments') then
    execute $POLICY$
      create policy task_attachments_staff_all on task_attachments
        for all
        using (app_is_staff())
        with check (app_is_staff())
    $POLICY$;
    execute $POLICY$
      create policy task_attachments_cliente_select on task_attachments
        for select
        using (
          app_pessoa_role() = 'cliente'
          and exists (
            select 1 from tasks tk
            where tk.id = task_attachments.task_id
              and tk.cliente_id = app_pessoa_cliente_id()
              and tk.visivel_cliente = true
          )
        )
    $POLICY$;
  end if;
end $$;

-- ============================================================
-- 10. TASK_DEPENDENCIES
-- ============================================================
-- Estava sem RLS habilitada. Habilita + policies.
alter table task_dependencies enable row level security;

drop policy if exists task_dependencies_staff_all on task_dependencies;
drop policy if exists task_dependencies_cliente_select on task_dependencies;

create policy task_dependencies_staff_all on task_dependencies
  for all
  using (app_is_staff())
  with check (app_is_staff());

-- Cliente NÃO precisa de dependências internas (informação operacional).
-- Sem policy de SELECT pra cliente = nega leitura.

-- ============================================================
-- 11. NOTIFICATIONS
-- ============================================================
-- Cada pessoa só vê próprias notificações. Staff full.
drop policy if exists prototipo_all on notifications;
drop policy if exists notifications_staff_all on notifications;
drop policy if exists notifications_self_select on notifications;

create policy notifications_staff_all on notifications
  for all
  using (app_is_staff())
  with check (app_is_staff());

create policy notifications_self_select on notifications
  for select
  using (recipient_pessoa_id = app_pessoa_id());

-- ============================================================
-- 12. STORAGE · bucket task-attachments
-- ============================================================
-- Substitui `prototipo_task_attachments_all` por policy tenant-aware.
-- Anexos são salvos em `task-attachments/<task_id>/<arquivo>`.
-- Cliente lê anexos de tasks dele E visíveis.
drop policy if exists prototipo_task_attachments_all on storage.objects;
drop policy if exists task_attachments_staff_all on storage.objects;
drop policy if exists task_attachments_cliente_read on storage.objects;

create policy task_attachments_staff_all on storage.objects
  for all
  using (bucket_id = 'task-attachments' and app_is_staff())
  with check (bucket_id = 'task-attachments' and app_is_staff());

-- Cliente lê o objeto se o primeiro segmento do path (= task_id)
-- corresponde a uma task visível dele.
create policy task_attachments_cliente_read on storage.objects
  for select
  using (
    bucket_id = 'task-attachments'
    and app_pessoa_role() = 'cliente'
    and exists (
      select 1 from tasks tk
      where tk.id::text = split_part(storage.objects.name, '/', 1)
        and tk.cliente_id = app_pessoa_cliente_id()
        and tk.visivel_cliente = true
    )
  );

-- ============================================================
-- 13. SANITY · usage_events
-- ============================================================
-- usage_events já tem policies decentes (insert authenticated,
-- select só admin). Confirmar drop de qualquer prototipo_all que
-- tenha vazado.
drop policy if exists prototipo_all on usage_events;

-- ============================================================
-- Pós-execução · checklist
-- ============================================================
-- 1. Rode `select role, count(*) from pessoas group by role;` — confirme
--    que não há pessoa sem role definida (cairia em policy de cliente).
-- 2. Teste com JWT de cliente:
--    curl 'https://<proj>.supabase.co/rest/v1/clientes?select=*' \
--      -H "apikey: <anon>" -H "Authorization: Bearer <jwt-cliente>"
--    deve retornar APENAS 1 cliente (o próprio).
-- 3. Idem pra tasks: deve retornar apenas tasks com visivel_cliente=true
--    do cliente_id do user.
-- 4. Teste como admin/interno: deve retornar tudo igual antes.
-- 5. Após validar, mover este arquivo pra `applied/`.
