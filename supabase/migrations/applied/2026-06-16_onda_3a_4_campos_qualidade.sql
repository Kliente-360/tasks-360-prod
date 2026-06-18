-- ============================================================
-- Bucket D · Onda 3.A · 4 campos de qualidade
-- ============================================================
-- Adiciona 4 colunas em tasks:
--   3.1 criterio_aceite                 · text · obrigatório de escopo_definido+
--   3.5 valor_entregue                  · text · obrigatório na conclusão
--   3.4 prioridade_solicitada_cliente   · enum (alta/media/baixa) · opcional
--   3.3 motivo_reabertura               · text · prompt ao reabrir task concluída
-- ============================================================

begin;

alter table public.tasks
  add column if not exists criterio_aceite text not null default '',
  add column if not exists valor_entregue text not null default '',
  add column if not exists prioridade_solicitada_cliente text,
  add column if not exists motivo_reabertura text;

-- enum check pro prioridade_solicitada_cliente
alter table public.tasks
  drop constraint if exists tasks_prio_solicitada_check;
alter table public.tasks
  add constraint tasks_prio_solicitada_check
    check (prioridade_solicitada_cliente is null
           or prioridade_solicitada_cliente in ('alta','media','baixa'));

commit;
