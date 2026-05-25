-- 2026-05-12 · task_checklist (jsonb inline)
-- Checklist colapsável dentro da task. Estrutura simples: array de { id, body, done }.
-- JSONB inline em vez de tabela separada: poucas linhas por task, sem realtime
-- multi-user, cabe no fluxo de autosave existente sem mudar adapter pattern.

alter table tasks
  add column if not exists checklist jsonb not null default '[]'::jsonb;
