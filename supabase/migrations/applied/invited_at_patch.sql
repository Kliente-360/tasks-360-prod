-- Acesso controlado por "convite" (separado de cadastro).
-- pessoa.email cadastrado é necessário; invited_at IS NOT NULL é
-- também necessário pra pedir/usar magic link.
--
-- Admin convida → invited_at = now()
-- Admin desconvida → invited_at = null (corta acesso)

alter table pessoas add column if not exists invited_at timestamptz;

-- Vincula invited_at automaticamente pra pessoas que já têm user_id.
-- (Migração suave: quem já logou no passado mantém acesso.)
update pessoas set invited_at = now() where user_id is not null and invited_at is null;

create index if not exists pessoas_invited_idx on pessoas(invited_at) where invited_at is not null;
