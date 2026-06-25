-- Migration: standups (jun/2026)
-- Tabela pra armazenar o "standup diário" injetado via MCP.
-- Idempotência por `data` (um standup por dia · UPSERT no endpoint).
--
-- Premissas:
--   - sem dependências externas (não referencia outras tabelas)
--   - `data` é a chave natural de idempotência (date type · timezone-free)
--   - `atualizado_em` mantido por trigger BEFORE UPDATE
--   - RLS: liberado pra qualquer authenticated (admin/interno) leitura.
--     Escrita só via edge function (service_role bypassa RLS).
--
-- Rollback:
--   DROP TABLE IF EXISTS public.standups;

-- ── Tabela ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.standups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data            date NOT NULL UNIQUE,
  conteudo_md     text NOT NULL,
  texto_whatsapp  text,
  resumo          text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.standups IS 'Standup diário do time · 1 row por data (upsert via post-standup edge fn).';
COMMENT ON COLUMN public.standups.data IS 'Data do standup (YYYY-MM-DD) · UNIQUE · chave de idempotência.';
COMMENT ON COLUMN public.standups.conteudo_md IS 'Conteúdo principal em Markdown · renderizado no Briefing como primeiro card.';
COMMENT ON COLUMN public.standups.texto_whatsapp IS 'Versão pra colar no grupo WhatsApp (opcional).';
COMMENT ON COLUMN public.standups.resumo IS 'TL;DR curto (opcional · 1-2 frases).';

-- ── Trigger pra atualizado_em ───────────────────────────────
CREATE OR REPLACE FUNCTION public.standups_set_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS standups_atualizado_em_trg ON public.standups;
CREATE TRIGGER standups_atualizado_em_trg
  BEFORE UPDATE ON public.standups
  FOR EACH ROW
  EXECUTE FUNCTION public.standups_set_atualizado_em();

-- ── Índice de leitura (data desc é o ordering padrão do endpoint) ──
CREATE INDEX IF NOT EXISTS standups_data_desc_idx ON public.standups (data DESC);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.standups ENABLE ROW LEVEL SECURITY;

-- Staff (admin + interno) lê tudo. Cliente externo NÃO acessa.
DROP POLICY IF EXISTS standups_staff_read ON public.standups;
CREATE POLICY standups_staff_read ON public.standups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pessoas p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('admin', 'interno')
    )
  );

-- Escrita só via service_role (edge function bypassa RLS automaticamente).
-- Sem policy de INSERT/UPDATE/DELETE pra authenticated.
