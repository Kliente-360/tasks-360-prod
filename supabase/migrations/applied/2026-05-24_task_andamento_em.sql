-- ============================================================
-- Migration: tasks.andamento_em + backfill retroativo
-- Aplicada: v1.02.216 (24/mai/2026)
-- Arquivo SQL committed retroativamente em v1.02.228 (audit DB drift)
-- ============================================================
--
-- Adiciona timestamp da TRANSIÇÃO MAIS RECENTE da task pra macro-status
-- 'andamento'. Usado pelo Briefing pra calcular ciclo correto
-- (lead time da fase ativa, excluindo o tempo parado em backlog/
-- bloqueado).
--
-- Diferente de `status_em` (= momento da última mudança de status,
-- qualquer que seja), `andamento_em` registra ESPECIFICAMENTE a
-- entrada na fase produtiva. Se a task entra em andamento, volta
-- pra bloqueado, e entra de novo em andamento, andamento_em é
-- atualizado pra esse último "de novo".

-- 1. Adicionar coluna (idempotente)
alter table tasks add column if not exists andamento_em timestamptz;

comment on column tasks.andamento_em is
  'Timestamp da transição mais recente da task pra macro-status "andamento". '
  'Atualizado automaticamente quando status muda pra "andamento". '
  'Usado em métricas de cycle time no Briefing.';

-- 2. Backfill retroativo: para cada task que JÁ esteve em andamento
--    em algum momento (histórico), preencher com o occurred_at mais
--    recente da transição → 'andamento'. Cobre tanto task_field_history
--    (novo) quanto task_status_history (legado).
update tasks t
set andamento_em = sub.last_andamento
from (
  select task_id, max(occurred_at) as last_andamento
  from (
    -- Transições registradas via task_field_history (campo = 'status')
    select task_id, occurred_at
    from task_field_history
    where field = 'status' and to_value = 'andamento'
    union all
    -- Transições registradas via task_status_history (legado)
    select task_id, occurred_at
    from task_status_history
    where to_status = 'andamento'
  ) all_hist
  group by task_id
) sub
where t.id = sub.task_id
  and t.andamento_em is null;  -- só preenche se ainda não tem (idempotente)

-- 3. Para tasks que NUNCA tiveram histórico mas estão atualmente em
--    andamento (ex: tasks antigas pré-histórico), usar status_em
--    como aproximação.
update tasks
set andamento_em = status_em
where status = 'andamento'
  and andamento_em is null
  and status_em is not null;
