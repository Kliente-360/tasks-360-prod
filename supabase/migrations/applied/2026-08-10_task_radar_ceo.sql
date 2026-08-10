-- Radar do CEO · flag boolean em tasks pra CEO marcar tarefas
-- importantes e orientar cobrança de andamento (v1.03.214, ago/2026).
--
-- Design:
--   • coluna radar boolean default false + índice parcial (só WHERE radar=true)
--   • trigger BEFORE UPDATE reverte mudança se caller não é CEO
--     (Postgres não tem column-level RLS · usamos trigger)
--   • trigger BEFORE INSERT bloqueia inserir com radar=true por não-CEO
--     (idem — evita bypass via INSERT ao invés de UPDATE)
--
-- Rollback:
--   drop trigger trg_radar_ceo_only on public.tasks;
--   drop function public.enforce_radar_ceo_only();
--   alter table public.tasks drop column radar;

alter table public.tasks
  add column if not exists radar boolean not null default false;

create index if not exists tasks_radar_idx
  on public.tasks (radar) where radar = true;

-- Trigger de proteção: só CEO pode ligar/desligar radar
create or replace function public.enforce_radar_ceo_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_ceo boolean;
begin
  -- Só valida quando radar realmente muda (INSERT com true, ou UPDATE que troca)
  if tg_op = 'INSERT' then
    if new.radar is not true then
      return new;  -- default false · nada a validar
    end if;
  elsif tg_op = 'UPDATE' then
    if coalesce(new.radar, false) = coalesce(old.radar, false) then
      return new;  -- radar não mudou
    end if;
  end if;

  -- Resolve is_ceo do caller. auth.uid() é o supabase-js user; casa com
  -- pessoas.user_id. Fallback pra false se caller não estiver em pessoas
  -- (edge functions com service_role passam · não têm auth.uid).
  if auth.uid() is null then
    return new;  -- service_role ou trigger em cascata · deixa passar
  end if;

  select p.is_ceo into is_ceo
    from public.pessoas p
    where p.user_id = auth.uid()
    limit 1;

  if coalesce(is_ceo, false) is not true then
    -- Reverte silenciosamente pro valor anterior · não levanta erro
    -- pra não quebrar UPDATEs de outros campos que caller tem permissão
    if tg_op = 'INSERT' then
      new.radar := false;
    else
      new.radar := old.radar;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_radar_ceo_only on public.tasks;
create trigger trg_radar_ceo_only
  before insert or update of radar on public.tasks
  for each row execute function public.enforce_radar_ceo_only();
