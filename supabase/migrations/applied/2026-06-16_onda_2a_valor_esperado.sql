-- ============================================================
-- Bucket D · Onda 2.A · disciplina de dados
-- ============================================================
-- Adiciona coluna valor_esperado na tabela tasks:
--   • Texto livre, default '' (retrocompat — tasks atuais ficam vazias)
--   • Aparece no modal como sub-campo da seção "Descrição"
--     (Descrição = Solicitação + Valor Esperado)
--   • Não força preenchimento; é um pedido de qualidade
--     pra IA-summary ter contexto rico de valor entregue
-- ============================================================

begin;

alter table public.tasks
  add column if not exists valor_esperado text not null default '';

commit;
