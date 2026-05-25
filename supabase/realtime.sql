-- Habilita Postgres Changes (realtime) nas 4 tabelas.
-- Roda uma vez no SQL Editor do Supabase.

alter publication supabase_realtime add table clientes;
alter publication supabase_realtime add table pessoas;
alter publication supabase_realtime add table projetos;
alter publication supabase_realtime add table tasks;
