-- ============================================================
-- subetapa_patch.sql
-- Adiciona subetapas (nível 2) ao kanban, mantendo `status`
-- (nível 1, macro) como derivado via trigger.
--
-- Macros e seus subs:
--   backlog    → backlog · priorizado · em_definicao · escopo_definido
--   andamento  → em_desenvolvimento · em_homologacao · em_revisao
--                · pronto_producao · em_implantacao
--   bloqueado  → bloqueado
--   concluido  → concluido
--
-- App passa a escrever apenas `subetapa`. Trigger BEFORE INSERT/UPDATE
-- of subetapa derive `status` automaticamente.
-- ============================================================

-- 1) Coluna subetapa.
alter table tasks add column if not exists subetapa text;

-- Backfill a partir do status atual (escolhe o sub "default" de cada macro).
update tasks set subetapa = case status
  when 'backlog'    then 'backlog'
  when 'andamento'  then 'em_desenvolvimento'
  when 'bloqueado'  then 'bloqueado'
  when 'concluido'  then 'concluido'
end where subetapa is null;

alter table tasks alter column subetapa set not null;
alter table tasks alter column subetapa set default 'backlog';

alter table tasks drop constraint if exists tasks_subetapa_check;
alter table tasks add constraint tasks_subetapa_check check (subetapa in (
  'backlog','priorizado','em_definicao','escopo_definido',
  'em_desenvolvimento','em_homologacao','em_revisao','pronto_producao','em_implantacao',
  'bloqueado','concluido'
));

-- 2) Coluna subetapa_em (timestamp da última mudança de sub-etapa).
alter table tasks add column if not exists subetapa_em timestamptz;
update tasks set subetapa_em = coalesce(status_em, criado_em) where subetapa_em is null;

create index if not exists idx_tasks_subetapa on tasks(subetapa);

-- 3) Trigger: status (macro) é derivado de subetapa.
create or replace function sync_task_status_from_subetapa()
returns trigger language plpgsql as $$
begin
  new.status := case new.subetapa
    when 'backlog'             then 'backlog'
    when 'priorizado'          then 'backlog'
    when 'em_definicao'        then 'backlog'
    when 'escopo_definido'     then 'backlog'
    when 'em_desenvolvimento'  then 'andamento'
    when 'em_homologacao'      then 'andamento'
    when 'em_revisao'          then 'andamento'
    when 'pronto_producao'     then 'andamento'
    when 'em_implantacao'      then 'andamento'
    when 'bloqueado'           then 'bloqueado'
    when 'concluido'           then 'concluido'
  end;
  return new;
end$$;

drop trigger if exists trg_sync_task_status on tasks;
create trigger trg_sync_task_status
  before insert or update of subetapa on tasks
  for each row execute function sync_task_status_from_subetapa();
