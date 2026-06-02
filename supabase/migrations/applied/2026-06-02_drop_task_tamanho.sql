-- ============================================================
-- Migration: drop tasks.tamanho (coluna órfã)
-- Aplicada: v1.02.228 (audit DB drift)
-- ============================================================
--
-- A coluna `tasks.tamanho` (enum mini/small/medio/grande/mini_projeto)
-- foi criada em 2026-05-10_heuristicas_onda_a.sql como heurística pré-IA
-- de classificação ortogonal ao esforço.
--
-- Auditoria pós-cutover (v1.02.227) confirmou:
--   - 0 referências em src/ (UI, components, lib)
--   - 0 referências em supabase/functions/ (edge functions)
--   - 0 referências em src/lib/adapters.ts (não mapeada)
--   - 0 referências em queries .select()
--
-- A função `effTamanho()` em src/lib/task-utils.ts ainda existe e calcula
-- dinamicamente, mas é independente desta coluna.

alter table tasks drop column if exists tamanho;
