-- ============================================================
-- Notifications · 2 mudanças
-- ============================================================
-- 1) Adiciona kind 'cliente_comentou' ao enum check.
--    Existente 'cliente_respondeu' agora significa "cliente
--    respondeu a um comment seu" (reply). Novo 'cliente_comentou'
--    significa "cliente postou comment top-level numa task sua".
--    Os dois caem no mesmo grupo "Updates do cliente" no sino.
--
-- 2) Aperta RLS de `prototipo_all` (lê/escreve tudo) pro padrão:
--    - SELECT: só o recipient
--    - INSERT: qualquer authenticated (sender ≠ recipient, e o
--      sender não consegue ler depois — sem risco)
--    - UPDATE: só o recipient (pra marcar read_at)
--    - DELETE: ninguém (CASCADE já cuida via task/pessoa drop)

-- 1) Kind enum
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'mention',
    'assigned',
    'comment_on_my_task',
    'cliente_comentou',
    'cliente_respondeu',
    'status_change',
    'generico'
  ));

-- 2) RLS · drop policy provisória e cria as 3 específicas
drop policy if exists prototipo_all on notifications;
drop policy if exists notifications_select_self on notifications;
drop policy if exists notifications_insert_any on notifications;
drop policy if exists notifications_update_self on notifications;

create policy notifications_select_self
  on notifications
  for select
  using (recipient_pessoa_id = app_pessoa_id());

create policy notifications_insert_any
  on notifications
  for insert
  with check (auth.uid() is not null);

create policy notifications_update_self
  on notifications
  for update
  using (recipient_pessoa_id = app_pessoa_id())
  with check (recipient_pessoa_id = app_pessoa_id());

-- DELETE: sem policy → ninguém deleta diretamente. CASCADE cobre
-- via tasks/pessoas/comments.
