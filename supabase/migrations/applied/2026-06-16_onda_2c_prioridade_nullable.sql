-- ============================================================
-- Bucket D · Onda 2.C · prioridade vazia ("não revisada")
-- ============================================================
-- Permitir NULL e remover default 'P2' silencioso.
-- Tasks existentes com 'P2' ficam com 'P2' (não é retroativo).
-- A partir desta migration:
--   • novas tasks criadas sem prioridade vêm NULL
--   • Triagem força escolha explícita pra aceitar
--   • PriChip renderiza chip cinza "Revisar" quando NULL
-- ============================================================

begin;

alter table public.tasks
  alter column prioridade drop default;

alter table public.tasks
  alter column prioridade drop not null;

commit;
