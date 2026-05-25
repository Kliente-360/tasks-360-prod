-- Reordenação manual no backlog.
-- ordem = float (permite inserir entre dois com média; renumeração só se precisar).

alter table tasks add column if not exists ordem double precision;
create index if not exists tasks_ordem_idx on tasks(ordem);
