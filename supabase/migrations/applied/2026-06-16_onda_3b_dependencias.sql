-- ============================================================
-- Bucket D · Onda 3.B · dependências entre tasks
-- ============================================================
-- Array simples de uuids · tasks que precisam estar concluídas antes
-- desta poder ser concluída. Sem nova tabela (decisão Felipe).
-- ============================================================

begin;

alter table public.tasks
  add column if not exists bloqueada_por_tasks uuid[] not null default '{}';

commit;
