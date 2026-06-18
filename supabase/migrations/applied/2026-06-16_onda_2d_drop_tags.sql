-- ============================================================
-- Bucket D · Onda 2.D · drop tags
-- ============================================================
-- Campo `tags text[]` em tasks era zumbi — ninguém usava (cardinalidade
-- ~0 em prod). Removido em conjunto com a UI, filtros e CSV de export.
-- (tipo_trabalho fica · vai virar enum exposto no Portal pro cliente
--  classificar bug/melhoria na criação · Onda futura.)
-- ============================================================

begin;

alter table public.tasks drop column if exists tags;

commit;
