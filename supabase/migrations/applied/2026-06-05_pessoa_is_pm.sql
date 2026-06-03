-- Flag is_pm em pessoas pra excluir PMs (gerentes de projeto) de
-- cálculos de capacidade/carga/saúde no Dashboard.
--
-- PMs não dividem tasks com o time de desenvolvimento e suas tasks
-- (quando existem) refletem coordenação, não execução — distorcem
-- métricas de alocação.
--
-- Default false (todos são exec por padrão). Marcar manualmente:
--   update pessoas set is_pm = true where nome ilike 'jessica%';
--
-- Depois de rodada, mover pra applied/.

alter table pessoas add column if not exists is_pm boolean not null default false;

-- Sanity check pós-aplicação:
-- select id, nome, role, is_pm from pessoas order by nome;
