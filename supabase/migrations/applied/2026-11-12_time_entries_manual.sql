-- Timesheet: distingue lançamento manual (data + duração) de cronômetro.
-- Manual não tem horário real de início/fim; a tela mostra "-" nesses casos.
alter table public.time_entries add column if not exists manual boolean not null default false;

-- Backfill: o formulário manual grava duração em minutos exatos; o
-- cronômetro grava com segundos e milissegundos. Registro editado pelo
-- formulário também cai aqui (o horário dele já é sintético).
update public.time_entries
   set manual = true
 where ended_at is not null
   and manual = false
   and (extract(epoch from ended_at - started_at)::numeric % 60) = 0;
