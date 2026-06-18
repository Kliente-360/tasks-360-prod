-- ============================================================
-- Bucket D · Onda 3.D · cliente abre task no Portal
-- ============================================================
-- Cliente externo pode criar tasks via Portal. Cai na fila da Triagem
-- (espelha o fluxo de IA: criada → pré-triagem → time aceita/rejeita).
--
-- 3.6 · cliente abre task
-- ============================================================

begin;

alter table public.tasks
  add column if not exists criado_por_cliente boolean not null default false;

-- ─── RLS · cliente pode INSERT só nas próprias tasks, com gates
drop policy if exists tasks_cliente_insert on public.tasks;
create policy tasks_cliente_insert on public.tasks
  for insert with check (
    app_pessoa_role() = 'cliente'
    AND cliente_id = app_pessoa_cliente_id()
    AND visivel_cliente = true
    AND subetapa = 'backlog'
    AND status = 'backlog'
    AND criado_por_cliente = true
    AND triada_em IS NULL
    AND pessoa_id IS NULL
    AND privada = false
  );

commit;
