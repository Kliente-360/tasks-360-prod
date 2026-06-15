-- ============================================================
-- Tasks · campo solucao_implementada (entrega vs pedido)
-- ============================================================
-- Decisão A (jun/2026): mantém `descricao` como o "pedido" e adiciona
-- `solucao_implementada` como o "entregue". Modal mostra o campo
-- condicionalmente (só de subetapa ≥ em_homologacao em diante) pra
-- não poluir tasks iniciais.
--
-- Use case principal: IA-summary (B.2 weekly · B.3 TL;DR · B.7 risk
-- scanner) tem 2 campos estruturados pra montar narrativa
-- "pedido → entrega" sem precisar inferir da thread de comments.
--
-- Idempotente.

alter table public.tasks
  add column if not exists solucao_implementada text;
