-- Remove tabela task_dependencies — feature "Dependências UI" descontinuada.
-- Nenhuma referência no app Next (verificado em 2026-06-02).
-- cascade remove índices, policies e entrada na publication supabase_realtime.

drop table if exists task_dependencies cascade;
