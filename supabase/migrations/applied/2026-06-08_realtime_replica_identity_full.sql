-- ============================================================
-- Realtime · replica identity full nas tabelas com delta in-place
-- ============================================================
-- Por padrão o Postgres só envia PK + colunas alteradas no payload
-- de UPDATE/DELETE da publication realtime. Resultado: o frontend
-- recebe payload parcial e tasks reconstruídas via `taskFromDb`
-- aplicavam defaults nos campos ausentes — Backlog/Foco viam tasks
-- "vazias" depois de qualquer update externo.
--
-- `replica identity full` força o Postgres a enviar a linha INTEIRA
-- (antes + depois) no payload, garantindo que o frontend reconstrua
-- a task corretamente sem clobber.
--
-- Custo: write amplification ~1-2x em UPDATEs frequentes, irrelevante
-- pro nosso volume (~poucos mil updates/dia). Vale a pena pra UX
-- correta de realtime.
--
-- Idempotente: alter table com replica identity é seguro re-rodar.

alter table tasks         replica identity full;
alter table clientes      replica identity full;
alter table projetos      replica identity full;
alter table pessoas       replica identity full;
alter table task_comments replica identity full;
alter table notifications replica identity full;

-- Verificação:
--   select relname, relreplident from pg_class
--   where relname in ('tasks','clientes','projetos','pessoas','task_comments','notifications');
-- Esperado: relreplident = 'f' (full) em todas.
