-- ============================================================
-- Migration: drop tabela task_status_history (registro retroativo)
-- ============================================================
--
-- A tabela `task_status_history` foi a primeira implementação de log
-- de mudanças de status, criada em `auth_history_patch.sql`. Foi
-- substituída por `task_field_history` em mai/2026
-- (`2026-05-10_task_field_history.sql`), que é mais genérica (qualquer
-- campo, não só status).
--
-- Em algum momento posterior ao cutover (jun/2026), a tabela legada
-- foi dropada diretamente no Supabase Dashboard, mas o SQL nunca foi
-- commitado em applied/. Audit de DB drift (v1.02.228) descobriu via
-- backfill de `tasks.andamento_em` que falhou ao consultar a tabela
-- legada.
--
-- Este arquivo registra o DROP retroativamente. Idempotente (`IF EXISTS`).

drop table if exists task_status_history;
