-- Fix: webhook duplicado em comments.
--
-- A migration 2026-05-22_webhook_payload_v2.sql criou um trigger novo
-- `webhook_comment` (after insert or update) mas só dropou pelo nome novo.
-- Os triggers originais da 2026-05-16_sf_task_webhook.sql tinham nomes
-- diferentes (`webhook_comment_insert` + `webhook_comment_update`) e
-- nunca foram removidos.
--
-- Resultado: 3 triggers ativos em task_comments apontando pra mesma
-- função trg_webhook_comment() — todo INSERT dispara 2 webhooks (legacy
-- + v2) e todo UPDATE também. Sintoma: comments idênticos chegando em
-- duplicata no Salesforce no mesmo segundo.
--
-- Pra tasks o bug não existe — a v2 dropou e recriou pelo mesmo nome
-- (webhook_task_update), então sobrou só 1.
-- ─────────────────────────────────────────────────────────────────

drop trigger if exists webhook_comment_insert on task_comments;
drop trigger if exists webhook_comment_update on task_comments;

-- Verificação esperada após aplicar:
--   select tgname from pg_trigger
--    where tgrelid = 'task_comments'::regclass and not tgisinternal;
-- Deve listar apenas: trg_task_comments_no_nested_reply, webhook_comment.
