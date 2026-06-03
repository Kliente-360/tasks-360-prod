-- A.4 · Triagem obrigatória pra tasks criadas por IA.
--
-- Conceito: toda task criada com criado_por_ia=true entra em "limbo"
-- (não aparece em Backlog/Foco/Kanban/Calendário/Dashboard) até ser
-- explicitamente ACEITA por alguém na aba Triagem. Aceitar exige que
-- responsável + prazo + esforço estejam preenchidos. Também é possível
-- REJEITAR (arquiva com motivo opcional).
--
-- Schema:
--   triada_em timestamp null    · null = aguardando triagem (gate)
--                                · set = entrou pro backlog real
--   triada_por uuid null        · pessoa que aceitou OU rejeitou (audit)
--   motivo_arquivamento text    · usado quando rejeitada (opcional pra
--                                 arquivamentos normais; preenchido pelo
--                                 fluxo de rejeição)
--
-- Distinção aceitar vs rejeitar:
--   aceitar:  triada_em + triada_por
--   rejeitar: triada_em + triada_por + arquivado_em + motivo_arquivamento
--
-- Backfill: tasks IA existentes recebem triada_em = criado_em (assume
-- que já passaram pelo processo informal antes do gate existir, não
-- queremos elas "voltando" pra triagem).
--
-- Tasks criadas manualmente (criado_por_ia=false) nunca passam por esse
-- gate — `triada_em` fica null indefinidamente e é ignorado pelas
-- queries (filtro é `criado_por_ia=true AND triada_em IS NULL`).

alter table tasks
  add column if not exists triada_em timestamp null,
  add column if not exists triada_por uuid null references pessoas(id),
  add column if not exists motivo_arquivamento text null;

-- Backfill defensivo
update tasks
  set triada_em = criado_em
  where criado_por_ia = true and triada_em is null;

-- Sanity check pós-aplicação:
-- select id, titulo, criado_por_ia, triada_em, arquivado_em, motivo_arquivamento
--   from tasks
--   where criado_por_ia = true
--   order by criado_em desc limit 10;
