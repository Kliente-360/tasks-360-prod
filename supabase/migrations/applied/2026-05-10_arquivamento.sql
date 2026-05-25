-- Arquivamento de clientes e projetos.
-- Adiciona timestamp opcional. NULL = ativo. Não-NULL = arquivado em.
-- Idempotente. Sem destrutivo.
--
-- Premissas:
--   - Tasks NÃO ganham coluna; auto-arquivam quando status='concluido'
--     há +14 dias (filtro lógico no app, sem schema change).
--   - Clientes/projetos arquivados continuam acessíveis pra histórico
--     mas somem dos selects e dashboards default.
--
-- Rollback: alter table clientes drop column arquivado_em;
--           alter table projetos drop column arquivado_em;

alter table clientes
  add column if not exists arquivado_em timestamptz;

alter table projetos
  add column if not exists arquivado_em timestamptz;

create index if not exists idx_clientes_arquivado_em on clientes(arquivado_em);
create index if not exists idx_projetos_arquivado_em on projetos(arquivado_em);
