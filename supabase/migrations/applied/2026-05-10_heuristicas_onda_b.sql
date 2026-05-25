-- Onda B de heurísticas — relacionamento e qualidade.
-- Adiciona 3 atributos pequenos com alto ROI pra detector pré-IA.
-- Idempotente. Sem destrutivo.
--
-- Premissas:
--   - Onda A (tier, sla, capacidade) deve estar aplicada (não bloqueia mas faz sentido junto).
--   - reopen_count incrementa via trigger quando uma task sai de
--     status='concluido' pra qualquer outro status.
--
-- Rollback:
--   alter table pessoas drop column senioridade;
--   alter table projetos drop column tipo;
--   alter table tasks drop column reopen_count;
--   drop trigger if exists trg_reopen_count on tasks;
--   drop function if exists fn_increment_reopen_count;

-- 1. Senioridade em pessoas
alter table pessoas
  add column if not exists senioridade text;

do $$ begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'pessoas_senioridade_check'
  ) then
    alter table pessoas
      add constraint pessoas_senioridade_check
      check (senioridade is null or senioridade in ('junior','pleno','senior','lead'));
  end if;
end $$;

-- 2. Tipo em projetos
alter table projetos
  add column if not exists tipo text;

do $$ begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'projetos_tipo_check'
  ) then
    alter table projetos
      add constraint projetos_tipo_check
      check (tipo is null or tipo in ('implantacao','sustentacao','discovery','projeto'));
  end if;
end $$;

-- 3. reopen_count em tasks + trigger
alter table tasks
  add column if not exists reopen_count int not null default 0;

create or replace function fn_increment_reopen_count()
returns trigger as $$
begin
  if old.status = 'concluido' and new.status is distinct from 'concluido' then
    new.reopen_count := coalesce(old.reopen_count, 0) + 1;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_reopen_count on tasks;
create trigger trg_reopen_count
  before update of status on tasks
  for each row
  execute function fn_increment_reopen_count();
