-- Alinha vocabulário de cliente.tier com o app.
-- Antes (schema): 'estrategico' | 'regular' | 'oportunidade'
-- Depois (alinhado app): 'estrategico' | 'recorrente' | 'spot'
--
-- Migração de dados existentes:
--   regular      → recorrente
--   oportunidade → spot
-- estrategico permanece.
--
-- Idempotente. Pode rodar mesmo sem dados pré-existentes.

-- Remap valores legados (caso existam) antes de aplicar a constraint nova.
update clientes set tier = 'recorrente' where tier = 'regular';
update clientes set tier = 'spot'        where tier = 'oportunidade';

alter table clientes drop constraint if exists clientes_tier_check;
alter table clientes add constraint clientes_tier_check
  check (tier is null or tier in ('estrategico','recorrente','spot'));
