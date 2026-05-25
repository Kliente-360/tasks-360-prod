-- Domínios de email associados ao cliente. Permite automações externas
-- (Apps Script lendo notas Gemini, Cowork etc.) identificarem o cliente
-- correto a partir do domínio dos participantes da reunião — útil pra
-- clientes com nome acrônimo (ex: "CTF", "VB") onde o nome não aparece
-- no domínio.
--
-- Cada item: domínio puro, SEM @ (ex: "bodytech.com.br"). Case-insensitive
-- — normalização (lowercase, trim, strip @) é feita no app e na edge
-- function antes de persistir.
--
-- Default '{}' (array vazio) e NOT NULL — get-clientes sempre retorna o
-- campo, nunca omite.

alter table clientes
  add column if not exists dominios text[] not null default '{}'::text[];

-- Index GIN pra lookup rápido por domínio (automação procura "qual cliente
-- tem 'bodytech.com.br' nos dominios?").
create index if not exists idx_clientes_dominios on clientes using gin (dominios);
