-- Remove telemetria legada do Alpine (usage_events).
-- Nenhuma edge function depende desta tabela (verificado em 2026-05-25).
-- PostHog descartado — Vercel logs suficiente para o time.
--
-- Passo 1: identificar e remover cron job (rodar antes do drop)
--   select jobid, jobname from cron.job where jobname like '%usage%';
--   select cron.unschedule(<jobid>);
--
-- Passo 2: rodar abaixo.

drop function if exists fn_usage_events_cleanup();
drop table if exists usage_events cascade;
