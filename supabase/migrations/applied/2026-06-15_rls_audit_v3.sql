-- ============================================================
-- V.3 · RLS audit · pré-launch Pão e Talho (Bucket V)
-- ============================================================
-- Fixes aprovados em docs/gestao/AUDIT_RLS.md
--   GAP A · task_attachments · coluna visivel_cliente
--   GAP B · task_field_history · whitelist de field_name pro cliente
--   GAP C · notifications · habilita cliente self (pré-req V.8)
--   GAP D · notifications · apertar staff_all pra admin-only
--   GAP E · notifications · drop policy duplicada
-- ============================================================

begin;

-- ─────────────────────────────────────────────────────────────
-- GAP B · task_field_history · cliente só vê histórico de campos
-- com whitelist (esconde esforco, tempoRealHoras, pessoa_id,
-- status interno e demais valores que vazariam fluxo do time).
-- ─────────────────────────────────────────────────────────────
drop policy if exists task_field_history_cliente_select on public.task_field_history;
create policy task_field_history_cliente_select on public.task_field_history
  for select using (
    app_pessoa_role() = 'cliente'
    AND field in (
      -- valores que existem hoje em task_field_history e são seguros pro cliente
      'subetapa',
      'prazo',
      -- forward-compat: ainda não geram entry hoje (jun/2026), mas se
      -- adicionarmos tracking no futuro já ficam liberados pro cliente.
      'titulo',
      'descricao',
      'solucao_implementada'
    )
    AND EXISTS (
      SELECT 1 FROM tasks tk
      WHERE tk.id = task_field_history.task_id
        AND tk.cliente_id = app_pessoa_cliente_id()
        AND tk.visivel_cliente = true
    )
  );

-- ─────────────────────────────────────────────────────────────
-- GAP A · task_attachments · flag visivel_cliente por anexo.
-- Default true mantém retrocompat. Anexos marcados false (uso
-- interno) ficam invisíveis pro cliente mesmo em task visível.
-- ─────────────────────────────────────────────────────────────
alter table public.task_attachments
  add column if not exists visivel_cliente boolean not null default true;

drop policy if exists task_attachments_cliente_select on public.task_attachments;
create policy task_attachments_cliente_select on public.task_attachments
  for select using (
    app_pessoa_role() = 'cliente'
    AND visivel_cliente = true
    AND EXISTS (
      SELECT 1 FROM tasks tk
      WHERE tk.id = task_attachments.task_id
        AND tk.cliente_id = app_pessoa_cliente_id()
        AND tk.visivel_cliente = true
    )
  );

-- ─────────────────────────────────────────────────────────────
-- GAP E · notifications · drop policy duplicada
-- (notifications_self_select tinha o mesmo predicate de
-- notifications_select_self — drift histórico).
-- ─────────────────────────────────────────────────────────────
drop policy if exists notifications_self_select on public.notifications;

-- ─────────────────────────────────────────────────────────────
-- GAP D · notifications · apertar staff_all pra admin-only.
-- Interno passa a usar só select_self/update_self (já existem).
-- Admin mantém visão total pra suporte/debug.
-- ─────────────────────────────────────────────────────────────
drop policy if exists notifications_staff_all on public.notifications;
create policy notifications_admin_all on public.notifications
  for all using (app_is_admin()) with check (app_is_admin());

-- ─────────────────────────────────────────────────────────────
-- GAP C · notifications · habilita cliente self (pré-req V.8).
-- INSERT já é coberto por notifications_insert_any (qualquer
-- authenticated insere — destinatário é validado pelo recipient).
-- ─────────────────────────────────────────────────────────────
create policy notifications_cliente_self_select on public.notifications
  for select using (
    app_pessoa_role() = 'cliente'
    AND recipient_pessoa_id = app_pessoa_id()
  );

create policy notifications_cliente_self_update on public.notifications
  for update using (
    app_pessoa_role() = 'cliente'
    AND recipient_pessoa_id = app_pessoa_id()
  ) with check (
    app_pessoa_role() = 'cliente'
    AND recipient_pessoa_id = app_pessoa_id()
  );

commit;

-- ============================================================
-- Pós-migração · validar manualmente:
--   SELECT polname, polcmd, pg_get_expr(polqual, polrelid)
--   FROM pg_policy WHERE polrelid IN (
--     'public.task_field_history'::regclass,
--     'public.task_attachments'::regclass,
--     'public.notifications'::regclass
--   ) ORDER BY polrelid, polname;
-- ============================================================
