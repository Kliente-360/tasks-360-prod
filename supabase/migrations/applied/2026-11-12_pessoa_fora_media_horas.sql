-- Pessoas que não lançam horas como rotina (ex.: Edu) ficam fora da média
-- por dia do Timesheet. CEO e PM já saem pelos flags is_ceo/is_pm.
alter table public.pessoas add column if not exists fora_media_horas boolean not null default false;
update public.pessoas set fora_media_horas = true where nome = 'Edu' and role = 'interno';
