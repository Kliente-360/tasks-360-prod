-- ============================================================
-- Migration: clientes · cor + tema do header do Portal cliente
-- Aplicada: v1.02.235 (03/06/2026)
-- ============================================================
--
-- Cada cliente pode customizar a cor do header do Portal cliente
-- (skin de marca por cliente). `cor_portal` é hex completo (#RRGGBB).
-- `cor_portal_texto` define se o texto sobre essa cor é branco ('light')
-- ou preto ('dark') — depende do contraste da cor escolhida.
--
-- Defaults: nullable. Quando NULL, Portal usa --bg-portal padrão (verde
-- Kliente escuro) com texto branco — comportamento pré-feature preservado.

alter table clientes
  add column if not exists cor_portal      text,
  add column if not exists cor_portal_texto text check (cor_portal_texto in ('light', 'dark'));

comment on column clientes.cor_portal is
  'Hex (#RRGGBB) usado como background do header do Portal cliente. NULL = default DS (#0A3A1F).';
comment on column clientes.cor_portal_texto is
  'Cor do texto sobre cor_portal: light=branco, dark=preto. NULL = light.';
